// zip -r LineBot.zip index.js node_modules
var request = require('request');
var aws = require('aws-sdk');
var config = require('./config');

exports.handler = function(event, context) {

	var param = JSON.parse(JSON.stringify(event));

    if (!param.events){
        return context.fail("fail");
    }

    // Event Object取得(LINE MessagingAPI)
    var reply_token = param.events[0].replyToken;
    console.log('reply_token : ' + reply_token);
    var receive_message_type = param.events[0].message.type;
    console.log('receive_message_type : ' + receive_message_type);
    var receive_message = param.events[0].message.text;
    console.log('receive_message : ' + receive_message);
    var receive_id = '';

    var usr_id = param.events[0].source.userId;
    console.log('usr_id : ' + usr_id);
    var grp_id = param.events[0].source.groupId;
    console.log('grp_id : ' + grp_id);

    if (!param.events[0].source.groupId){
        receive_id = param.events[0].source.userId;
    } else {
        receive_id = param.events[0].source.groupId;
    }

    // @TODO KMSで管理
    var docomo_apiKey = config.docomo_apiKey;
    var docomo_options = {
        url: 'https://api.apigw.smt.docomo.ne.jp/dialogue/v1/dialogue?APIKEY=' + docomo_apiKey,
        headers: {
            "Content-Type": "application/json"
        },
        body: '',
        json: true
    };

    // @TODO KMSで管理
    var line_channelAccessToken = config.line_channelAccessToken;
    // paramater準備
    var line_options = {
            url: 'https://api.line.me/v2/bot/message/reply',
            headers: {
            	'Content-Type': 'application/json',
                'Authorization': `Bearer ${line_channelAccessToken}`
            },
            body: '',
            json: true
        };

    // lineへの送信データ
    var line_body = {
    	      replyToken: reply_token,
    	      messages:[
    	                {
    	                    "type":"text",
    	                    "text":""
    	                }
    	            ]
    	    };

    // DynamoDB Object
    var dynamo = new aws.DynamoDB.DocumentClient();

    var dbparams = {};
    dbparams.TableName = config.dynamoDB_tableName;

    //会話の場合はcontextとmodeを引き継ぐ
    if (receive_message_type == 'text') {

        // Docomo雑談API への送信データ
        var docomo_body = {
           "utt": receive_message,
           "t": "20"
         };

        if(receive_message != null && receive_message.indexOf('相談') != -1){
        	post_text_message_line("いつするねん？");
        	post_custom_message_line();
        }else {
        	post_docomo_message_line();
        }
    }

    function post_docomo_message_line(){
    	// 検索キー
        dbparams.Key = {
                mid: receive_id
            };

        console.log('mid : ' + receive_id);

        // DynamoDB から Contextとmodeがあるか検索
        dynamo.get(dbparams, function(err, data) {
                if (err) {
                    console.log(err, err.stack);
                } else {
                    console.log('get item from DynamoDB.');
                    if (Object.keys(data).length > 0 && data.Item.context){

                    	console.log('set item from DynamoDB.');

                        // Contextとmodeがあれば含めてDocomo雑談APIへPOST
                    	docomo_body.context = data.Item.context;
                    	docomo_body.mode = data.Item.mode;
                    }
                }

                console.log('go to Docomo API.');

                // Docomo API へリクエスト
                docomo_options.body = docomo_body;
                request.post(docomo_options, function (error, response, ret) {
                    if (!error) {
                        console.log(ret);
                        console.log('Docomo API is success.');

                        // DynamoDB に登録するデータ
                        var UpdateDBparams = {
                            TableName: dbparams.TableName,
                            Item: {
                                "mid": receive_id,
                                "context": ret.context,
                                "mode": ret.mode
                            }
                        };

                        console.log('put to DynamoDB.');
                        // DynamoDB へ登録
                        dynamo.put(UpdateDBparams, function(err, data) {
                            if (err) {
                                console.log('error: ' + JSON.stringify(err));
                            } else {
                            	line_body.messages[0].text = ret.utt;
                            	line_options.body = line_body;

                                // LINE Messaging API へリクエスト
                            	request.post(line_options, function(error, response, body){
                                    if (!error) {
                                        console.log(JSON.stringify(response));
                                        console.log(JSON.stringify(body));
                                        console.log('send to LINE.');

                                        context.succeed('done.');

                                    } else {
                                        console.log('error: ' + JSON.stringify(error));
                                    }
                                });
                            }
                        });
                    } else {
                        console.log('error: ' + JSON.stringify(error));
                    }
                });
        });
    }

    function post_custom_message_line() {

    	var columns = [];
    	columns.push({
//            "thumbnailImageUrl": item.snippet.thumbnails.medium.url,
            "title": "月曜日",
            "text": "this is a monday",
            "actions": [{
              "type": "uri",
              "label": "詳細を確認",
              "uri": 'http://www.oas.co.jp'
            }]
          });
    	columns.push({
//          "thumbnailImageUrl": item.snippet.thumbnails.medium.url,
          "title": "火曜日",
          "text": "this is a tuesday",
          "actions": [{
            "type": "uri",
            "label": "詳細を確認",
            "uri": 'http://www.oas.co.jp'
          }]
        });

    	// lineへの送信データ
        var cal_body = {
        	      replyToken: reply_token,
        	      messages:[{
        	    	  "type":"template",
        	          "altText":"carousel template",
        	          "template":{
        	        	  "type": "carousel",
        	        	  "columns": columns
        	          }
        	      }]
        	    };

        line_options.body = cal_body;

        // LINE Messaging API へリクエスト
    	request.post(line_options, function(error, response, body){
            if (!error) {
                console.log(JSON.stringify(response));
                console.log(JSON.stringify(body));
                console.log('send to LINE.');

                context.succeed('done.');

            } else {
                console.log('error: ' + JSON.stringify(error));
            }
        });
    }

    function post_text_message_line(text){

    	line_body.messages[0].text = text;
    	line_options.body = line_body;

        // LINE Messaging API へリクエスト
    	request.post(line_options, function(error, response, body){
            if (!error) {
                console.log(JSON.stringify(response));
                console.log(JSON.stringify(body));
                console.log('send to LINE.');

                context.succeed('done.');

            } else {
                console.log('error: ' + JSON.stringify(error));
            }
        });
    }
};
