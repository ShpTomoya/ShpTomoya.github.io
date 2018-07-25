var propertiy = PropertiesService.getScriptProperties();                  // プロジェクトからプロパティ取得

var LINE_URL = propertiy.getProperty('LINE_URL');                         // 返信するLINEのurlを取得
var CHANNEL_ACCESS_TOKEN = propertiy.getProperty('CHANNEL_ACCESS_TOKEN'); // LINEのアクセストークンを取得
var WIKIPEDIA_URL = propertiy.getProperty('WIKIPEDIA_URL');               // wikipediaのurlを取得
var SPREAD_SHEET_KEY = propertiy.getProperty('SPREAD_SHEET_KEY');         // スプレッドシートのキーを取得

// スプレッドシートのキーをセット
var spreadsheet = SpreadsheetApp.openById(SPREAD_SHEET_KEY);

var ERRORMESSAGE_NOT_IMG_TEXT_MESSAGE = "写真かテキストメッセージじゃないと、リプちゃんわからない！";
var ERRORMESSAGE_TRY_CATCH = "ごめん、文字が読み込めなかった！";
var ERRORMESSAGE_WORD_NOT_FIND_WIKIPEDIA = "ごめん、その単語はわからない！";
var ERRORMESSAGE_WORD_NOT_FIND_LIST = "やることリストに一致する項目がなかったよ！\nリストを見たいときは「やることリスト」って言ってね！";
var ERRORMESSAGE_LIST_ITEM_ZERO = "いま登録されてるやることはないよ！\nやることがあったら「xx yy する」で教えてね！";
var ERRORMESSAGE_FORMAT_ERROR = "フォーマットエラーだよ！\nフォーマットがわからないときは「リプちゃん」って話しかけてね！";

var MESSAGE_REPCHAN = "リプちゃんだよ！\n僕ができるのは ①文字が書いてある画像の文字起こし ②単語を調べること ③やることを記録しておくこと。\n①画像を送るか、 ②「xx とは」 ③「やることリスト」「xx yy する」「xx した」って話しかけてね！\n文字起こしには10秒くらいかかるよ、ちょっと待っててね！";


// LINEを送って来た人にメッセージを返信する関数
function sendLineMessageFromReplyToken(replyToken,replyText){
 var headers = {"Content-Type": "application/json; charset=UTF-8", "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN};
 var postData = {"replyToken": replyToken, "messages": [{"type": "text", "text": replyText}]};
 var options = {"method": "POST", "headers": headers, "payload": JSON.stringify(postData)};
  
 return UrlFetchApp.fetch(LINE_URL, options);
}

// doPost関数（LINEからメッセージがきたときに呼び出される関数）
function doPost(e) {
  try {
    var blob, message, replyText;
    var webhookData = JSON.parse(e.postData.contents).events[0];
    var userId = webhookData.source.userId;
    var replyToken = webhookData.replyToken;
  
    // 画像が送られてきたら、文字起こしをする
    if (webhookData.message.type === "image") {
      blob = getLineContent(webhookData.message.id); // LINEから画像を取得する
      replyText = getTextFromImg(blob);              // 画像から文字を取得する
    }  
    // テキストメッセージが送られてきたときの処理
    else if (webhookData.message.type === "text") {
      message = webhookData.message.text;
      replyText = textMessageCheck(userId, message);
    }
    // 画像でもテキストメッセージでもない場合、エラーメッセージを返す
    else {
      replyText = ERRORMESSAGE_NOT_IMG_TEXT_MESSAGE;
    }
    
    sendLineMessageFromReplyToken(replyToken, replyText);

  } catch (e){
    // 関数内でエラーが起きた場合の処理
    replyText = ERRORMESSAGE_TRY_CATCH;
    sendLineMessageFromReplyToken(replyToken, replyText);
  }
}

// LINEから送られてきた画像を取得する関数
function getLineContent(messageId) {
  var headers = {'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN};
  var options = {'method': 'GET','headers': headers};
  var url = 'https://api.line.me/v2/bot/message/' + messageId + '/content';
  var blob = UrlFetchApp.fetch(url, options).getBlob();
  return blob;
}

// 画像から文字を取得する関数
function getTextFromImg(imgBlob) {
  var resource = {title: imgBlob.getName(), mimeType: imgBlob.getContentType()};
  var options = {ocr: true};

  // Google Documentにファイルを作成し、画像を挿入してテキストを取得する
  var imgFile = Drive.Files.insert(resource, imgBlob, options);
  var doc = DocumentApp.openById(imgFile.id);
  var returnText = doc.getBody().getText().replace("\n", "");
  
  Drive.Files.remove(imgFile.id); // Google Documentに作成したファイルを削除する

  return returnText;
}

// 送られてきたテキストメッセージの内容を判別する関数
function textMessageCheck(userId, message) {
  var returnText;
  var commands = message.split(/\s+/); // テキストメッセージを空白で分割して配列に入れる（「/\s+/」は空白の正規表現）
  
  // wikipediaで単語を調べる処理
  if (commands.length === 2  && commands[1] === "とは") {
    returnText = keywordSearchFromWikipedia(commands[0]);
    // wikipediaに単語がなかったとき、エラーメッセージを返す
    if (!returnText) {
      returnText = ERRORMESSAGE_WORD_NOT_FIND_WIKIPEDIA;
    }
  }
  
  // やることをスプレッドシートに登録する処理
  else if (commands.length >= 2 && commands[commands.length - 1] === "する") {
    setItemToSpreadsheet(userId, commands);
    
    // 項目が1つのときのメッセージ
    if (commands.length === 1) {
      returnText = "やることリストに書いておいたよ！" + commands[0] + "がんばってね！\nリストを見たいときは「やることリスト」、" + commands[0] + "が終わったら「" + commands[0] + " した」って言ってね！";
    }
    // 項目が2つ以上のときのメッセージ
    else {
      var message = commands[0];
      for (var i = 1; i < commands.length; i++) {
        message += "と" + commands[i];
      }
      returnText = "やることリストに書いておいたよ！" + message + "がんばってね！\nリストを見たいときは「やることリスト」、作業が終わったら「xx した」って言ってね！";
    }
  }
  
  // やることをスプレッドシートから削除する処理
  else if (commands.length >= 2 && commands[commands.length - 1] === "した") {
    var result = deleteItem(userId, commands);
    
    // エラーが起きたときのメッセージ
    if (!result) {
      returnText = ERRORMESSAGE_WORD_NOT_FIND_LIST;
    } else {
      var message = commands[0];
      if (commands.length > 1) {
        for (var i = 1; i < commands.length; i++) {
          message += "と" + commands[i];
        }
      }
      returnText = message + "おつかれさま！やることリストから消しておいたよ！\nリストを見たいときは「やることリスト」って言ってね！";
    }
  }
  
  // 「やることリスト」を表示する処理
  else if (commands.length === 1 && commands[0] === "やることリスト") {
    var lists = getToDoList(userId);
    if (!lists) {
      returnText = ERRORMESSAGE_LIST_ITEM_ZERO;
    } else {
      var returnText = "やることリストには、以下の項目が登録されてるよ！\n";
      var listslen = lists.length;
      
      // やることリストの項目を整形する
      for (var i = 0; i < listslen; i++) {
        returnText += lists[i];
        if (i + 1 !== listslen) returnText += "\n";
      }
    }
  }
  
  // メッセージが「リプちゃん」のとき
  else if (commands.length === 1 && commands[0] === "リプちゃん") {
    returnText = MESSAGE_REPCHAN;
  }  
  // いずれでもないとき、エラーメッセージを返信する
  else {
    returnText = ERRORMESSAGE_FORMAT_ERROR;
  }
  
  return returnText;
}

// wikipediaからキーワードを探す関数
function keywordSearchFromWikipedia(word){
  var searchUrl = WIKIPEDIA_URL + encodeURIComponent(word);
  var options = {"method": "GET", "headers": {"Content-Type": "application/json; charset=UTF-8"}};
  var resultRoot = XmlService.parse(UrlFetchApp.fetch(searchUrl, options).getContentText()).getRootElement();
 
  var item = resultRoot.getChildren("result")[0];
  if (!item) return false; // wikipediaに一致する単語がなかったらfalseを返す

  var title = item.getChildText("title");
  var body = item.getChildText("body");
  var url = item.getChildText("url");
  
  var returnText = "「" + title + "」とは…" + "\n"+ "“" + body + "”" + "\n" + url + "\n" + "知りたいことはわかったかな？ 間違いがあったらごめんね！";
  return returnText;
}

// スプレッドシートにやることを入力する関数
function setItemToSpreadsheet(userId, contents){
  var sheetName = "data";
  var userDataRow = getUserDataRow(sheetName, userId);

  contents.pop(); // 配列contentsの末尾の「する」を削除する
  
  // はじめてデータを登録するときの処理
  if (!userDataRow) {
    contents.unshift(userId); // 配列contentsの先頭にuserIdを追加する
    appendToSheet(sheetName, contents);
  }
  // データを追加する処理
  else {
    var items = getToDoList(userId);
    var itemsLen = items.length + 2;
    for (var i = 0; i < contents.length; i++) {
      setItemsToSheet(sheetName, contents[i], userDataRow + 1, itemsLen + i);
    }
  }
}

// ユーザーがデータベースに記録されているかチェックする関数
function getUserDataRow(sheetName,userId){
  var sheet = spreadsheet.getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();     //シートにあるデータを二次元配列に入れる
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === userId) {
      return i; // Ueridの行番号を返す
    }
  }
  return false; // 一致するUserIdがなかったらfalseを返す
}

// スプレッドシートにデータを登録する関数
function appendToSheet(sheetName,contents){
  var sheet = spreadsheet.getSheetByName(sheetName);
  sheet.appendRow(contents);
}

// スプレッドシートにデータを追加する関数
function setItemsToSheet(sheetName,val,row,col){
 var sheet = spreadsheet.getSheetByName(sheetName);
 sheet.getRange(row, col).setValue(val);
}

// やることリストを取得する関数
function getToDoList(userId){
  var sheetName = "data";
  var userDataRow = getUserDataRow(sheetName, userId); // userDataがある行を取得する
  if (userDataRow === false) return false;             // userDataがなかったらfalseを返す
  
  var sheet = spreadsheet.getSheetByName(sheetName);
  var isData = sheet.getRange(userDataRow + 1, 2).getValue();
  if (isData.length === 0) return false;               // データが1つもなかったらfalseを返す
  
  var values = sheet.getDataRange().getValues();       // シートにあるデータを二次元配列に入れる 
  var userDataLen = values[userDataRow].length;
  
  // データがないセルの配列の要素を削除する
  for (var i = userDataLen - 1; i >= 0; i--) {
    if (values[userDataRow][i].length !== 0) break;
    values[userDataRow].pop();
  }
  
  values[userDataRow].shift(); // 配列の先頭のuserIdを削除する  
  return values[userDataRow];
}

// やることを削除する関数
function deleteItem(userId, items){
  var sheetName = "data";
  var userDataRow = getUserDataRow(sheetName, userId);
  if (!userDataRow) return false;               // userIdが登録されてなかったらfalseを返す
  
  items.pop();                                  // 配列contentsの末尾の「した」を削除する

  var lists = getToDoList(userId);              // 「やることリスト」を取得する
  var setItems = replaceToDoList(lists, items); // 「やることリスト」から一致するアイテムを削除する
  if (!setItems) return false;                  // 削除する項目がなかったらfalseを返す
  
  // やったことを削除したリストをスプレッドシートにセットする
  for (var i = 0; i < setItems.length; i++) {
    setItemsToSheet(sheetName, setItems[i], userDataRow + 1, i + 2);
  }
  
  return true;
}

// 「やることリスト」の一致するアイテムを削除して、配列の末尾に「空白」を追加する関数
function replaceToDoList(lists, items){
  var replaceFlag = false;
  
  for (var i = 0; i < items.length; i++) {
    for (var j = (lists.length - 1); j >= 0; j--) {
      if (lists[j] === items[i]) {
        lists.splice(j, 1); // 一致する項目を削除する
        lists.push("");     // 配列の末尾に「空白」の要素を追加する
        replaceFlag = true; // 1度でも削除したらフラグをtrueにする
      }
    }
  }
  if (!replaceFlag) return false; // 1度も削除しなかったらfalseを返す
  
  return lists;
}
