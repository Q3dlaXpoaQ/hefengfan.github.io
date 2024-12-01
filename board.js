"use strict";

var RESULT_UNKNOWN = 0;
var RESULT_WIN = 1;
var RESULT_DRAW = 2;
var RESULT_LOSS = 3;

var BOARD_WIDTH = 521;
var BOARD_HEIGHT = 577;
var SQUARE_SIZE = 57;
var SQUARE_LEFT = (BOARD_WIDTH - SQUARE_SIZE * 9) >> 1;
var SQUARE_TOP = (BOARD_HEIGHT - SQUARE_SIZE * 10) >> 1;
var THINKING_SIZE = 32;
var THINKING_LEFT = (BOARD_WIDTH - THINKING_SIZE) >> 1;
var THINKING_TOP = (BOARD_HEIGHT - THINKING_SIZE) >> 1;
var MAX_STEP = 10;
var PIECE_NAME = [
  "oo", null, null, null, null, null, null, null,
  "rk", "ra", "rb", "rn", "rr", "rc", "rp", null,
  "bk", "ba", "bb", "bn", "br", "bc", "bp", null,
];

function SQ_X(sq) {
  return SQUARE_LEFT + (FILE_X(sq) - 3) * SQUARE_SIZE;
}

function SQ_Y(sq) {
  return SQUARE_TOP + (RANK_Y(sq) - 3) * SQUARE_SIZE;
}

function MOVE_PX(src, dst, step) {
  return Math.floor((src * step + dst * (MAX_STEP - step)) / MAX_STEP + .5) + "px";
}

function alertDelay(message) {
  setTimeout(function() {
    alert(message);
  }, 250);
}

function Board(container, images, sounds) {
  this.images = images;
  this.sounds = sounds;
  this.pos = new Position();
  this.pos.fromFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
  this.animated = true;
  this.sound = true;
  this.search = null;
  this.imgSquares = [];
  this.sqSelected = 0;
  this.mvLast = 0;
  this.millis = 0;
  this.computer = -1;
  this.result = RESULT_UNKNOWN;
  this.busy = false;

  var style = container.style;
  style.position = "relative";
  style.width = BOARD_WIDTH + "px";
  style.height = BOARD_HEIGHT + "px";
  style.background = "url(" + images + "board.jpg)";
  var this_ = this;
  for (var sq = 0; sq < 256; sq ++) {
    if (!IN_BOARD(sq)) {
      this.imgSquares.push(null);
      continue;
    }
    var img = document.createElement("img");
    var style = img.style;
    style.position = "absolute";
    style.left = SQ_X(sq);
    style.top = SQ_Y(sq);
    style.width = SQUARE_SIZE;
    style.height = SQUARE_SIZE;
    style.zIndex = 0;
    img.onmousedown = function(sq_) {
      return function() {
        this_.clickSquare(sq_);
      }
    } (sq);
    container.appendChild(img);
    this.imgSquares.push(img);
  }

  this.thinking = document.createElement("img");
  this.thinking.src = images + "thinking.gif";
  style = this.thinking.style;
  style.visibility = "hidden";
  style.position = "absolute";
  style.left = THINKING_LEFT + "px";
  style.top = THINKING_TOP + "px";
  container.appendChild(this.thinking);

  this.dummy = document.createElement("div");
  this.dummy.style.position = "absolute";
  container.appendChild(this.dummy);

  this.flushBoard();
}

Board.prototype.playSound = function(soundFile) {
  if (!this.sound) {
    return;
  }
  try {
    new Audio(this.sounds + soundFile + ".wav").play();
  } catch (e) {
    this.dummy.innerHTML= "<embed src=\"" + this.sounds + soundFile +
        ".wav\" hidden=\"true\" autostart=\"true\" loop=\"false\" />";
  }
}

Board.prototype.setSearch = function(hashLevel) {
  this.search = hashLevel == 0 ? null : new Search(this.pos, hashLevel);
}

Board.prototype.flipped = function(sq) {
  return this.computer == 0 ? SQUARE_FLIP(sq) : sq;
}

Board.prototype.computerMove = function() {
  return this.pos.sdPlayer == this.computer;
}

Board.prototype.computerLastMove = function() {
  return 1 - this.pos.sdPlayer == this.computer;
}

Board.prototype.addMove = function(mv, computerMove) {
  if (!this.pos.legalMove(mv)) {
    return;
  }
  if (!this.pos.makeMove(mv)) {
    this.playSound("illegal");
    return;
  }
  this.busy = true;
  if (!this.animated) {
    this.postAddMove(mv, computerMove);
    return;
  }

  var sqSrc = this.flipped(SRC(mv));
  var xSrc = SQ_X(sqSrc);
  var ySrc = SQ_Y(sqSrc);
  var sqDst = this.flipped(DST(mv));
  var xDst = SQ_X(sqDst);
  var yDst = SQ_Y(sqDst);
  var style = this.imgSquares[sqSrc].style;
  style.zIndex = 256;
  var step = MAX_STEP - 1;
  var this_ = this;
  var timer = setInterval(function() {
    if (step == 0) {
      clearInterval(timer);
      style.left = xSrc + "px";
      style.top = ySrc + "px";
      style.zIndex = 0;
      this_.postAddMove(mv, computerMove);
    } else {
      style.left = MOVE_PX(xSrc, xDst, step);
      style.top = MOVE_PX(ySrc, yDst, step);
      step --;
    }
  }, 16);
}

Board.prototype.postAddMove = function(mv, computerMove) {
  if (this.mvLast > 0) {
    this.drawSquare(SRC(this.mvLast), false);
    this.drawSquare(DST(this.mvLast), false);
  }
  this.drawSquare(SRC(mv), true);
  this.drawSquare(DST(mv), true);
  this.sqSelected = 0;
  this.mvLast = mv;

  if (this.pos.isMate()) {
    this.playSound(computerMove ? "loss" : "win");
    this.result = computerMove ? RESULT_LOSS : RESULT_WIN;

    var pc = SIDE_TAG(this.pos.sdPlayer) + PIECE_KING;
    var sqMate = 0;
    for (var sq = 0; sq < 256; sq ++) {
      if (this.pos.squares[sq] == pc) {
        sqMate = sq;
        break;
      }
    }
    if (!this.animated || sqMate == 0) {
      this.postMate(computerMove);
      return;
    }

    sqMate = this.flipped(sqMate);
    var style = this.imgSquares[sqMate].style;
    style.zIndex = 256;
    var xMate = SQ_X(sqMate);
    var step = MAX_STEP;
    var this_ = this;
    var timer = setInterval(function() {
      if (step == 0) {
        clearInterval(timer);
        style.left = xMate + "px";
        style.zIndex = 0;
        this_.imgSquares[sqMate].src = this_.images +
            (this_.pos.sdPlayer == 0 ? "r" : "b") + "km.gif";
        this_.postMate(computerMove);
      } else {
        style.left = (xMate + ((step & 1) == 0 ? step : -step) * 2) + "px";
        step --;
      }
    }, 50);
    return;
  }

  var vlRep = this.pos.repStatus(3);
  if (vlRep > 0) {
    vlRep = this.pos.repValue(vlRep);
    if (vlRep > -WIN_VALUE && vlRep < WIN_VALUE) {
      this.playSound("draw");
      this.result = RESULT_DRAW;
      alertDelay("双方不变作和，辛苦了！");
    } else if (computerMove == (vlRep < 0)) {
      this.playSound("loss");
      this.result = RESULT_LOSS;
      alertDelay("长打作负，请不要气馁！");
    } else {
      this.playSound("win");
      this.result = RESULT_WIN;
      alertDelay("长打作负，祝贺你取得胜利！");
    }
    this.postAddMove2();
    this.busy = false;
    return;
  }

  if (this.pos.captured()) {
    var hasMaterial = false;
    for (var sq = 0; sq < 256; sq ++) {
      if (IN_BOARD(sq) && (this.pos.squares[sq] & 7) > 2) {
        hasMaterial = true;
        break;
      }
    }
    if (!hasMaterial) {
      this.playSound("draw");
      this.result = RESULT_DRAW;
      alertDelay("双方都没有进攻棋子了，辛苦了！");
      this.postAddMove2();
      this.busy = false;
      return;
    }
  } else if (this.pos.pcList.length > 100) {
    var captured = false;
    for (var i = 2; i <= 100; i ++) {
      if (this.pos.pcList[this.pos.pcList.length - i] > 0) {
        captured = true;
        break;
      }
    }
    if (!captured) {
      this.playSound("draw");
      this.result = RESULT_DRAW;
      alertDelay("超过自然限着作和，辛苦了！");
      this.postAddMove2();
      this.busy = false;
      return;
    }
  }

  if (this.pos.inCheck()) {
    this.playSound(computerMove ? "check2" : "check");
  } else if (this.pos.captured()) {
    this.playSound(computerMove ? "capture2" : "capture");
  } else {
    this.playSound(computerMove ? "move2" : "move");
  }

  this.postAddMove2();
  this.response();
}

Board.prototype.postAddMove2 = function() {
  if (typeof this.onAddMove == "function") {
    this.onAddMove();
  }
}

Board.prototype.postMate = function(computerMove) {
  alertDelay(computerMove ? "请再接再厉！" : "祝贺你取得胜利！");
  this.postAddMove2();
  this.busy = false;
}

Board.prototype.response = function() {
  if (this.search == null || !this.computerMove()) {
    this.busy = false;
    return;
  }
  this.thinking.style.visibility = "visible";
  var this_ = this;
  this.busy = true;
	var xmlhttp;
	if (typeof XMLHttpRequest != 'undefined') {
		xmlhttp = new XMLHttpRequest();
	} else {
		try {
			xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
		} catch(e) {
			xmlhttp = false;
		}
	}
	if (board.millis==1000){
	    var xmlhttpMove=xmlhttp
  xmlhttpMove.open('POST', 'https://www.chessdb.cn/chessdb.php?action=querypv&learn=1&board='+this.pos.toFen(), true);
	xmlhttpMove.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xmlhttpMove.onreadystatechange = function() {
		if (xmlhttpMove.readyState == 4) {
			if (xmlhttpMove.status == 200) {
				var ss = new String();
				var xx;
				if (xmlhttpMove.responseText.search(/pv:/) != -1 && xmlhttpMove.responseText.search(/depth:/) != -1 && xmlhttpMove.responseText.search(/score:/) != -1) {
				    var so=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("score")+6,xmlhttpMove.responseText.indexOf("depth")-7)
					var sc=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("depth")+6,xmlhttpMove.responseText.indexOf("pv")-7-xmlhttpMove.responseText.indexOf("depth"))
					var rps = xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3, 4)
					var iccs_move=rps
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,mv,1,sc,so),true);
            	this_.thinking.style.visibility = "hidden";
				}
				else{
				    let url1 = "https://engine.xqipu.com/api/engine/getMoves?fen=" + this_.pos.toFen()+"&level=vip";
	jQuery.ajax({
			type: "GET",
			contentType: "application/json",
			url: url1,
			timeout: 10000, //超时时间：4秒
			dataType: 'json',
			error: function(xhr, status, err){
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0), true);
                this_.thinking.style.visibility = "hidden";
			},
			success: function(result) {
			  let moves = result.moves || [];
			  let move2 = (moves[0] && moves[0].move) || "";
			  let new1=moves[0] && moves[0].pv || ""
			  let new2=moves[0] && moves[0].score || ""
			  var len=Math.ceil(new1.length/5)
			   var iccs_move=move2
			  var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,mv,100,len,new2),true);
            	this_.thinking.style.visibility = "hidden";
            
			}
				}); }
			}
			else{
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0),true);
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
			}
		}
	}
	xmlhttpMove.send();
	}else{
	var xmlhttpMove=xmlhttp
  xmlhttpMove.open('POST', 'https://www.chessdb.cn/chessdb.php?action=querypv&learn=1&board='+this.pos.toFen()+"&level=vip", true);
	xmlhttpMove.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	var this_=this
	xmlhttpMove.onreadystatechange = function() {
		if (xmlhttpMove.readyState == 4) {
			if (xmlhttpMove.status == 200) {
				var ss = new String();
				var xx;
				if (xmlhttpMove.responseText.search(/pv:/) != -1 && xmlhttpMove.responseText.search(/depth:/) != -1 && xmlhttpMove.responseText.search(/score:/) != -1) {
				    var so=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("score")+6,xmlhttpMove.responseText.indexOf("depth")-7)
					var sc=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("depth")+6,xmlhttpMove.responseText.indexOf("pv")-7-xmlhttpMove.responseText.indexOf("depth"))
					var rps = xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3, 4)
					var mm=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3,xmlhttpMove.responseText.length-xmlhttpMove.responseText.indexOf("pv")+1)
					var zzz='思考细节:'
					for (var x = 0; x < mm.length; x+=5) {
					    var iccs_move=mm.substr(x,4)
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	        this_.pos.makeMove(mv)
					    zzz=zzz+this_.pos.convertMvToCn(mv,true)+' '
					    if (zzz.length%50==0){
					        zzz=zzz+'<br/>'
					    }
					}
				for (var x = 0; x < mm.length; x+=5) {
				    this_.pos.undoMakeMove()
				}
					var html1=zzz
    document.getElementById('s').innerHTML=html1;
					var iccs_move=rps
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	var html='<div style="text-align:center;font-size:13.7px;">象棋云库出步,电脑得分:'+String(so)+',深度:'+String(sc)+'</div>'
    document.getElementById('m').innerHTML=html;
            	this_.pos.makeMove(mv);
            	this_.pos.undoMakeMove()
            	this_.addMove(mv,true);
            	this_.thinking.style.visibility = "hidden";
				}
				else{
				    var vlRep = this_.pos.repStatus(1);
				    if (vlRep>0){
				        setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0),true);
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
				    }else{
				    let url1 = "https://engine.xqipu.com/api/engine/getMoves?fen=" + this_.pos.toFen()+"&level=vip";
	jQuery.ajax({
			type: "GET",
			contentType: "application/json",
			url: url1,
			timeout: 10000, //超时时间：4秒
			dataType: 'json',
			error: function(xhr, status, err){
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0), true);
                this_.thinking.style.visibility = "hidden";
			},
			success: function(result) {
			  let moves = result.moves || [];
			  let move2 = (moves[0] && moves[0].move) || "";
			  let new1=moves[0] && moves[0].pv || ""
			  let new2=moves[0] && moves[0].score || ""
			  var len=0
			    var zzz='思考细节:'
					for (var x = 0; x < new1.length; x+=5) {
					    var iccs_move=new1.substr(x,4)
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	if (this_.pos.legalMove(mv)){
            	        var len=len+1
            	        this_.pos.makeMove(mv)
					    zzz=zzz+this_.pos.convertMvToCn(mv,true)+' '
					    if (zzz.length%50==0){
					        zzz=zzz+'<br/>'
					    }
            	        }
					}
				for (var x = 0; x < len; x+=1) {
				    this_.pos.undoMakeMove()
			    }
					var html1=zzz
    document.getElementById('s').innerHTML=html1;
			   var iccs_move=move2
			  var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            if (!this_.pos.legalMove(mv)){
                    setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0),true);
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
                }else{
            	var html='<div style="text-align:center;font-size:13.7px;">云库出步,分数:'+String(new2)+',深度:'+String(len)+'</div>'
    document.getElementById('m').innerHTML=html;
            	this_.addMove(mv,true);
            	this_.thinking.style.visibility = "hidden";
                }
			}
				}); }}
			}
			else{
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0),true);
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
			}
		}
	}
	xmlhttpMove.send();
	}
    
	    
}

Board.prototype.clickSquare = function(sq_) {
  if (this.busy || this.result != RESULT_UNKNOWN) {
    return;
  }
  var sq = this.flipped(sq_);
  var pc = this.pos.squares[sq];
  if ((pc & SIDE_TAG(this.pos.sdPlayer)) != 0) {
    this.playSound("click");
    if (this.mvLast != 0) {
      this.drawSquare(SRC(this.mvLast), false);
      this.drawSquare(DST(this.mvLast), false);
    }
    if (this.sqSelected) {
      this.drawSquare(this.sqSelected, false);
    }
    this.drawSquare(sq, true);
    this.sqSelected = sq;
  } else if (this.sqSelected > 0) {
    this.addMove(MOVE(this.sqSelected, sq), false);
  }
}

Board.prototype.drawSquare = function(sq, selected) {
  var img = this.imgSquares[this.flipped(sq)];
  img.src = this.images + PIECE_NAME[this.pos.squares[sq]] + ".gif";
  img.style.backgroundImage = selected ? "url(" + this.images + "oos.gif)" : "";
}

Board.prototype.flushBoard = function() {
  this.mvLast = this.pos.mvList[this.pos.mvList.length - 1];
  for (var sq = 0; sq < 256; sq ++) {
    if (IN_BOARD(sq)) {
      this.drawSquare(sq, sq == SRC(this.mvLast) || sq == DST(this.mvLast));
    }
  }
}

Board.prototype.restart = function(fen) {
  if (this.busy) {
    return;
  }
  var html='<div style="text-align:center;font-size:13.7px;">棋盘不显示？请使用Chrome内核浏览器，或者360极速模式。</div>'
  document.getElementById('m').innerHTML=html;
  var html1=''
  document.getElementById('s').innerHTML=html1;
  board.computer = 1 - selMoveMode.selectedIndex;
  this.result = RESULT_UNKNOWN;
  this.pos.fromFen(fen);
  this.flushBoard();
  this.playSound("newgame");
  this.response();
}

Board.prototype.retract = function() {
    if (this.busy) {
    return;
  }
  this.result = RESULT_UNKNOWN;
  if (this.pos.mvList.length > 1) {
    this.pos.undoMakeMove();
  }
  if (this.pos.mvList.length > 1 && this.computerMove()) {
    this.pos.undoMakeMove();
  }
  selMoveList.options.length = board.pos.mvList.length;
  selMoveList.selectedIndex = selMoveList.options.length - 1;
    this.flushBoard();
  this.response();
  var html='<div style="text-align:center;font-size:13.7px;">Fen: '+board.pos.toFen()+'</div>'
    document.getElementById('f').innerHTML=html;
    var html=''
    document.getElementById('m').innerHTML=html;
    document.getElementById('s').innerHTML=html;
}

Board.prototype.tip = function() {
    if (this.busy || this.result != RESULT_UNKNOWN) {
    return;
  }
  this.thinking.style.visibility = "visible";
  var this_ = this;
  this.busy = true;
	var xmlhttp;
	if (typeof XMLHttpRequest != 'undefined') {
		xmlhttp = new XMLHttpRequest();
	} else {
		try {
			xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
		} catch(e) {
			xmlhttp = false;
		}
	}
	if (board.millis==1000){
	    var xmlhttpMove=xmlhttp
  xmlhttpMove.open('POST', 'https://www.chessdb.cn/chessdb.php?action=querypv&learn=1&board='+this.pos.toFen(), true);
	xmlhttpMove.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xmlhttpMove.onreadystatechange = function() {
		if (xmlhttpMove.readyState == 4) {
			if (xmlhttpMove.status == 200) {
				var ss = new String();
				var xx;
				if (xmlhttpMove.responseText.search(/pv:/) != -1 && xmlhttpMove.responseText.search(/depth:/) != -1 && xmlhttpMove.responseText.search(/score:/) != -1) {
				    var so=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("score")+6,xmlhttpMove.responseText.indexOf("depth")-7)
				    var sc=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("depth")+6,xmlhttpMove.responseText.indexOf("pv")-7-xmlhttpMove.responseText.indexOf("depth"))
					var rps = xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3, 4)
					var iccs_move=rps
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,mv,1,sc,so));
            	this_.thinking.style.visibility = "hidden";
				}
				else{
				    let url1 = "https://engine.xqipu.com/api/engine/getMoves?fen=" + this_.pos.toFen()+"&level=vip";
	jQuery.ajax({
			type: "GET",
			contentType: "application/json",
			url: url1,
			timeout: 10000, //超时时间：4秒
			dataType: 'json',
			error: function(xhr, status, err){
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			},
			success: function(result) {
			  let moves = result.moves || [];
			  let move2 = (moves[0] && moves[0].move) || "";
			  let new1=moves[0] && moves[0].pv || ""
			  let new2=moves[0] && moves[0].score || ""
			  var len=Math.ceil(new1.length/5)
			   var iccs_move=move2
			  var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,mv,100,len,new2));
            	this_.thinking.style.visibility = "hidden";
            
			}
				}); }
			}
			else{
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
			setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
			}
		}
	}
	xmlhttpMove.send();
	}else{
	var xmlhttpMove=xmlhttp
  xmlhttpMove.open('POST', 'https://www.chessdb.cn/chessdb.php?action=querypv&learn=1&board='+this.pos.toFen(), true);
	xmlhttpMove.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xmlhttpMove.onreadystatechange = function() {
		if (xmlhttpMove.readyState == 4) {
			if (xmlhttpMove.status == 200) {
				var ss = new String();
				var xx;
				if (xmlhttpMove.responseText.search(/pv:/) != -1 && xmlhttpMove.responseText.search(/depth:/) != -1 && xmlhttpMove.responseText.search(/score:/) != -1) {
				    var so=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("score")+6,xmlhttpMove.responseText.indexOf("depth")-7)
					var sc=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("depth")+6,xmlhttpMove.responseText.indexOf("pv")-7-xmlhttpMove.responseText.indexOf("depth"))
					var rps = xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3, 4)
					var mm=xmlhttpMove.responseText.substr(xmlhttpMove.responseText.indexOf("pv")+3,xmlhttpMove.responseText.length-xmlhttpMove.responseText.indexOf("pv")+1)
					var zzz='思考细节:'
					for (var x = 0; x < mm.length; x+=5) {
					    var iccs_move=mm.substr(x,4)
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	        this_.pos.makeMove(mv)
					    zzz=zzz+this_.pos.convertMvToCn(mv,true)+' '
					    if (zzz.length%50==0){
					        zzz=zzz+'<br/>'
					    }
					}
				for (var x = 0; x < mm.length; x+=5) {
				    this_.pos.undoMakeMove()
				}
					var html1=zzz
    document.getElementById('s').innerHTML=html1;
					var iccs_move=rps
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	var html='<div style="text-align:center;font-size:13.7px;">象棋云库出步,玩家得分:'+String(so)+',深度:'+String(sc)+'</div>'
    document.getElementById('m').innerHTML=html;
            	this_.pos.makeMove(mv);
            	this_.pos.undoMakeMove()
            	this_.addMove(mv);
            	this_.thinking.style.visibility = "hidden";
				}
				else{
				    var vlRep = this_.pos.repStatus(1);
				    if (vlRep>0){
				        setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
				    }else{
				    let url1 = "https://engine.xqipu.com/api/engine/getMoves?fen=" + this_.pos.toFen()+"&level=vip";
	jQuery.ajax({
			type: "GET",
			contentType: "application/json",
			url: url1,
			timeout: 10000, //超时时间：4秒
			dataType: 'json',
			error: function(xhr, status, err){
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			},
			success: function(result) {
			  let moves = result.moves || [];
			  let move2 = (moves[0] && moves[0].move) || "";
			  let new1=moves[0] && moves[0].pv || ""
			  let new2=moves[0] && moves[0].score || ""
			  var len=0
			    var zzz='思考细节:'
					for (var x = 0; x < new1.length; x+=5) {
					    var iccs_move=new1.substr(x,4)
					var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
            	        if (this_.pos.legalMove(mv)){
            	        var len=len+1
            	        this_.pos.makeMove(mv)
					    zzz=zzz+this_.pos.convertMvToCn(mv,true)+' '
					    if (zzz.length%50==0){
					        zzz=zzz+'<br/>'
					    }
            	        }
					}
				for (var x = 0; x < len; x+=1) {
				    this_.pos.undoMakeMove()
			    }
					var html1=zzz
    document.getElementById('s').innerHTML=html1;
			   var iccs_move=move2
			  var x_array = new Array();
                x_array["a"] = 0;
                x_array["b"] = 1;
            	x_array["c"] = 2;
            	x_array["d"] = 3;
            	x_array["e"] = 4;
            	x_array["f"] = 5;
            	x_array["g"] = 6;
            	x_array["h"] = 7;
            	x_array["i"] = 8;
            	
              var from_x = iccs_move.charAt(0);
              var from_y = iccs_move.charAt(1);
              var from_x_index = x_array[from_x];
              
              var to_x = iccs_move.charAt(2);
              var to_y = iccs_move.charAt(3);
              var to_x_index = x_array[to_x];  
              //console.log('from_x_index', from_x_index);
              //console.log('from_y', from_y);
            
            	var sqSrc = (9-from_y +3) * 16 + (from_x_index +3);
            	//console.log('sqSrc', sqSrc);
            	var sqDst = (9-to_y +3) * 16 + (to_x_index +3);
               // console.log('sqDst', sqDst);
            	var mv = sqSrc + (sqDst << 8);
        if (!this_.pos.legalMove(mv)){
            setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
    }else{
            	var html='<div style="text-align:center;font-size:13.7px;">云库出步,分数:'+String(new2)+',深度:'+String(len)+'</div>'
    document.getElementById('m').innerHTML=html;
            	this_.addMove(mv);
            	this_.thinking.style.visibility = "hidden";
    }
            
			}
				}); }}
			}
			else{
			// 注意：如果发生了错误，错误信息（第二个参数）除了得到null之外，还可能是"timeout", "error", "notmodified" 和 "parsererror"。
                setTimeout(function() {
                
                this_.addMove(board.search.searchMain(LIMIT_DEPTH, board.millis,0,0));
                this_.thinking.style.visibility = "hidden";
			    
			}, 250);
			}
		}
	}
	xmlhttpMove.send();
	}
}

Board.prototype.setSound = function(sound) {
  this.sound = sound;
  if (sound) {
    this.playSound("click");
  }
}
