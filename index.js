const express = require('express');
require("dotenv").config();
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({server: server})
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT;
const development = process.env.NODE_ENV;
const mongoose = require("mongoose");
const character = require("./models/characterModel.js")
const boss = require("./models/bossModel.js");
const game = require('./models/gameModel.js');
const PICK_TIMER = 35; // 35 seconds for players to make a pick

let timestampInfo = []; // array of game ids with timestamps
let pausedInfo = []; // paused game info - game timestamp info here is saved and is not changed
// format is as follows
/*
  {
    "id": id,
    "timestamp": timestamp
` }
*/

try{
    wss.on('connection', function connection(ws) {
        console.log("new client");
        ws.on('message', async function incoming(message){
            // could send JSON data and sort it
            const jsonStr = JSON.parse(message);
            // 
            console.log(jsonStr);
            // calling options: 
            let result = ""; // should be a JSON string
            switch(jsonStr.type){
              case "create":
                  result = await createGame(jsonStr.id);
                  break;
              case "get":
                  result = await getGame(jsonStr.id);
                  break;
              case "hover":
                  result = await addHover(jsonStr);
                  break;
              case "character":
                  result = await addCharacter(jsonStr);
                  break;
              case "boss": 
                  result = await addBoss(jsonStr);
                  break;
              case "add":
                  result = await addItems(jsonStr);
                  break;
              case "times":
                  result = await addTimes(jsonStr);
                  break;
              case "switch":
                  result = await switchPhase(jsonStr.id, jsonStr.phase);
                  break;
              case "turn":
                  result = await findTurn(jsonStr.id, jsonStr.getSelectionInfo);
                  break; 
              case "find":
                  result = await getInformation(jsonStr.query);
                  break; 
              case "status":
                  result = await updateStatus(jsonStr);
                  break;
              case "players":
                  result = await checkPlayers(jsonStr.id);
                  break;
              case "team":
                  result = await updateTeam(jsonStr);
                  break;
              case "ids":
                  result = await findAllIds(id);
                  break;
              case "pause":
                  result = await pauseGame(id);
                  break;
              case "resume": 
                  result = await resumeGame(id);
              default:
                  result = JSON.stringify({message: "Failure", errType: "Nonexistent", error: "Please enter a valid selection."});
                  break;
                // add a few extra options
            }
            // ws.send("message obtained: " + message); 
            // console.log("-----------------")
            // console.log(result);
            let resCopy = JSON.parse(result);
            if(resCopy.message == "Failure" || resCopy.requesterOnly){
              ws.send(result); // send only back to the user
            }
            else{ // on a character selection, user switch, pick add, etc, etc. send to every client including the picker
              wss.clients.forEach(function each(client) {
                // send data back to all connected clients
                if (client.readyState === WebSocket.OPEN) {
                  // client !== ws &&
                  client.send(result);
                }
              });
            }
        });
        ws.on('error', err => {
            let errVal = development == "development" ? err.toString() : "An error occurred"
            ws.send(JSON.stringify({
              message: "Failure",
              errType: "server",
              error: errVal,
            }));
            return;
        })
        // send timer here
        
    })
}
catch(err){
  console.log(err);
}
mongoose
  .connect(MONGO_URL)
  .catch((err) => {
    console.log(err);
  });

const createGame = async (data) => {
    // create the game information
  const defaultSettings = {
    _id: data,
    playerst1: ["player1", "player2", "player3"],
    playerst2: ["player4", "player5", "player6"],
    division: "Advanced",
    result: "setup",
    connected: [0, 0, 0],
    // timest1: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    // timest2: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    phase: "Waiting",
    /*
    penaltyt1: {},
    penaltyt2: {},
    deatht1: {},
    deatht2: {}
    */
  };
  let length = 7;
  const time = Date.time(); // basically use this to reset time
  defaultSettings.timestamp = time;
  if(data.mode == "premier"){
    length = 9;
  }
  // data also now can add extra bans
  /*
  Object.assign(defaultSettings.penaltyt1, Array(length).fill(Array(6).fill(false)));
  // 6 is arbitrary (number of penalties), 3 is number of players, 7 is default number of bosses
  Object.assign(defaultSettings.penaltyt2, Array(length).fill(Array(6).fill(false)));
  Object.assign(defaultSettings.deatht1, Array(length).fill(Array(3).fill(false)));
  Object.assign(defaultSettings.deatht2, Array(length).fill(Array(3).fill(false))); 
  */
  // creates a game with the default settings
  const res = await game.create(defaultSettings);
  return JSON.stringify({
    message: "Success",
    type: "create",
    game: res,
    id: res._id,
    requesterOnly: true,
  });

}
const getGame = async(data) => {
    const res = await game.findById(data).lean();
    if(res == null){
      let errVal =
        development == "development" ? "Game not found" : "An error occurred";
      return JSON.stringify({
        message: "Failure",
        errType: "query",
        error: errVal,
      });
    }
    else{
      return JSON.stringify({
        message: "Success",
        type: "get",
        game: res,
        id: res._id,
        requesterOnly: true
      });
    }
}
setInterval(async () => {
  // where to store times
  // decide to only update times on connecting to websocket or on a pick / ban

  Object.entries(timestampInfo).forEach(async ([gameID, value]) => {
    // check if the time is greater than 0, set to PICK_TIMER by default
    if (value.timestamp >= 0) {
      value.timestamp -= 1;
    }
    else{
      // if time is up, run a function that essentially randoms the pick and resets the timer
      // first checks for hover

      let thisGame = await game.findById(value.id);
      let hovered = -3;
      if(thisGame.hovered[thisGame.turn - 1] != -1){
        hovered = thisGame.hovered[thisGame.turn - 1]; 
      }
      // change newInfo accordingly
      let newInfo = {
        id: value.id,
        type: "add",
        changed: thisGame.result,
        data: {
          boss: hovered,
          ban: hovered,
          character: hovered,
          team: thisGame.turn,
        },
      };
      value.timestamp = PICK_TIMER;
      let hoverResult = await addItems(newInfo);
      // make sure to remove at the end
      // 
      // let thisResult = await addItems(newInfo);
      // send the result to all clients
      
      wss.clients.forEach(function each(client) {
        // send data back to all connected clients
        if (client.readyState === WebSocket.OPEN) {
          client.send(hoverResult); // for now send placeholder for testing purposes
          // this is successful so far
          // next, grab phase from game info
          // send to additem
        }
      });
    }
    // return the values whenever a connection is made from a client
    // send a request on open socket
  })
  // create a global variable that stores the time, i think this is fine because times will disappear on restart but are not that important to store
  
}, 1000)


const addHover = async(info) => {
  // essentially sets the hovered charaacter for when the time runs out
  // applies to boss too
  console.log("test success for addhover");
  const gameResult = await game.findById(info.id);
  if(gameResult == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }

  gameResult.hovered[info.team - 1] = info.hovered;
  await gameResult.save();
  // let pick stay as is
  return JSON.stringify({
    message: "success",
    type: "complete",
    requesterOnly: true
  });
  // nothing needs to be done on local end, this is just to confirm it was received
}
// 
const addBoss = async(info) => {
  console.log(info);
  // just add a boss like normal
  let newInfo = {
    id: info.id,
    type: "add",
    changed: "boss",
    data: {
      boss: info.bossId,
      team: info.team,
    },
  };
  return addItems(newInfo);
}
const addCharacter = async(info) => {
  const gameResult = await game.findById(info.id);
  let newInfo = {
    id: info.id,
    type: "add",
    changed: gameResult.result,
    data: {
      character: info.charId,
      team: info.team,
    },
  };
  return addItems(newInfo);
}
const addItems = async (info) => {
    // add information
    // change bosses, character picks
    try{
        const gameResult = await game.findById(info.id);
        // verify turn is valid
        if(gameResult.turn != info.data.team){
          return JSON.stringify({
            message: "Failure",
            type: "tinker",
            error: "Team on user end and team on server end don't align. Are you tampering with the data?"
          })
          // info.data.team = gameResult.turn;
        }
        // console.log(gameResult);
        switch (info.changed) {
          case "boss": {
            if(info.data.boss == -3){
              // choose a random boss
              // first find all bosses chosen
              let bossIds = [];
              for(let i = 0; i < gameResult.bosses.length; i++){
                bossIds.push(gameResult.bosses[i]._id);
              } 
              let newestBoss = await boss.findOne().sort({ _id: -1 });
              newestBoss = newestBoss._id;
              // find last id
              // generate random number
              let randomVal = -1; 
              let valid = true;
              while(randomVal < 0 || bossIds.includes(randomVal) || valid == false){
                randomVal = Math.floor(Math.random() * (newestBoss + 1));
                // console.log("random: "+randomVal)
                let newInfo = await boss.findById(randomVal);
                if(randomVal == 14){
                  valid = false;
                }
                // console.log("type: "+newInfo.type)
                if (gameResult.fearless) {
                  if (gameResult.fearlessBosses.includes(randomVal)) {
                    valid = false;
                  }
                }
                if((newInfo.type == "legend" && gameResult.division != "premier") || (newInfo.type == "weekly" && gameResult.division == "open")){
                  valid = false;
                  // console.log("fail - division")
                }
                else if (gameResult.longBoss[info.data.team - 1] && newInfo.long == true) {
                  valid = false;
                  // console.log("fail - long")
                } else {
                  valid = true;
                }
              }
              info.data.boss = randomVal;
            }
            if (gameResult.fearless) { // fearless checker
              if (gameResult.fearlessBosses.includes(info.data.boss)) {
                // again randomize
                info.data.boss = -3;
                return await addItems(info);
              }
            }
            let findBoss = await boss.findById(info.data.boss); // id of boss
            /*
            return JSON.stringify({
              message: "Success",
              type: "boss",
              boss: info.data.boss,
              name: findBoss.boss,
              bossType: findBoss.type
            })
            */
            let last = false; // verify boss count
            if (
              findBoss == null ||
              (await checkExists(info.id, findBoss.long, info.data.team, findBoss.boss)) 
            ) {
              // instead of forcing an error, randomize it, mainly for the case of hovering
              info.data.boss = -3;
              console.log("boss exists already!");
              return await addItems(info);
            }
            if (findBoss.type == "legend" && gameResult.division != "premier") {
              console.log("boss is premier!");
              info.data.boss = -3;
              return await addItems(info);
            }
            let firstEmpty = gameResult.bosses.findIndex((val) => val._id == -1);
            if (firstEmpty != -1) {
              gameResult.bosses[firstEmpty] = findBoss;
              if (firstEmpty == gameResult.bosses.length - 1) {
                last = true;
              }
              if(findBoss.long){
                gameResult.longBoss[info.data.team - 1] = true;
              }
            }
            timestampInfo.find((val) => val.id == info.id).timestamp = PICK_TIMER; 
            let newTeam = 0; // switch teams
            switch (info.data.team) {
              case 1:
                newTeam = 2;
                break;
              case 2:
                newTeam = 1;
                break;
              default:
                return JSON.stringify({
                  message: "Failure",
                  errType: "Nonexistent",
                  error: "Please provide a valid team to select.",
                });
            }
            if (last) {
              if(gameResult.extrabans.length > 0){
                gameResult.result = "extraban";
              }
              else{
                gameResult.result = "ban";
              }
              newTeam = -1;
            } 
            // add new boss, save. and return a message
            newTeam < 0 ? gameResult.turn = -1 * newTeam : gameResult.turn = newTeam;
            await gameResult.save();
            return JSON.stringify({
              message: "Success",
              type: "boss",
              boss: info.data.boss,
              id: info.id,
              nextTeam: newTeam,
            });
          }
          case "extraban": {
            // handle extra bans here, these go before normal bans
            if (info.data.character == -3) {
              info.data.character = -2; // random ban means no ban
            }
            const charPick = await character.findById(info.data.character);
            let status = await checkCharacterExists(info.id, charPick);
            if (
              charPick == null ||
              (status && info.data.character != -2 && info.data.character != -1)
            ) {
              info.data.character = -2;
              return await addItems(info); // forces no ban
            }
            // first check if the character even exists
            let last = false; // for last team this is default
            let newTeam = 1;
            let firstEmpty = gameResult.extrabans.findIndex(
              (val) => val._id == -1
            );
            if (firstEmpty != -1) {
              charPick.chosen = true;
              gameResult.extrabans[firstEmpty] = charPick;
              if (firstEmpty == gameResult.extrabans.length - 1) {
                // check for last extra ban filled
                last = true;
              }
            }
            const timerObj = timestampInfo.find((val) => val.id == info.id);
            timerObj.timestamp = PICK_TIMER; // reset timer
            if (!last) {
              // find who is next
              let turnArr = [];
              for (
                let i = 0;
                i < Math.max(gameResult.extrabanst1, gameResult.extrabanst2);
                i++
              ) {
                if (i < gameResult.extrabanst1) {
                  turnArr.push(1);
                }
                if (i < gameResult.extrabanst2) {
                  turnArr.push(2);
                }
              }
              newTeam = turnArr[firstEmpty + 1]; // calculates next team
              gameResult.turn = newTeam;
            } else {
              gameResult.result = "ban";
              newTeam = -2;
              gameResult.turn = 1;
            }
            await gameResult.save();
            return JSON.stringify({
              message: "Success",
              type: "extraban",
              extraban: info.data.character,
              id: info.id,
              nextTeam: newTeam,
            });
          }
          case "ban": {
            // get character by index from character model and add it to the bans
            if (info.data.character == -3) {
              info.data.character = -2; // random ban means no ban 
            }
            const charPick = await character.findById(info.data.character);
            let status = await checkCharacterExists(info.id, charPick);
            if (charPick == null || (status && info.data.character != -2 && info.data.character != -1)){
              info.data.character = -2;
              return await addItems(info); // forces no ban
            }
            let last = 0;
            let firstEmpty = gameResult.bans.findIndex(val => val._id == -1);
            if(firstEmpty != -1){
              charPick.chosen = true;
              gameResult.bans[firstEmpty] = charPick;
              if (firstEmpty == gameResult.bans.length - 1) { // swaps to picks on 4th and 6th ban - this is 6th ban
                last = 1;
              }
              else if(firstEmpty == gameResult.bans.length - 3){ // 4th ban
                last = 2;
              }
            }
            timestampInfo.find((val) => val.id == info.id).timestamp = PICK_TIMER; 
            // add new bans, save, return message
            let newTeam = 0;
            switch(info.data.team){
              case 1: 
                newTeam = 2;
                break;
              case 2:
                newTeam = 1;
                break;
              default:
                return JSON.stringify({
                  message: "Failure",
                  errType: "Nonexistent",
                  error: "Please provide a valid team to select.",
                });
            }
            if (last != 0) {
              newTeam = -1 * last;
            }
            switch(newTeam){
              case -1:
                gameResult.turn = 2;
                gameResult.result = "pick";
                break;
              case -2:
                gameResult.turn = 1;
                gameResult.result = "pick";
                break;
              default:
                gameResult.turn = newTeam;
                break;
            }
            await gameResult.save();
            return JSON.stringify({
              message: "Success",
              type: "ban",
              ban: info.data.character,
              id: info.id,
              nextTeam: newTeam,
            });
          }
                
          case "pick": {
            // get character by index from character model and add it to the picks
            if (info.data.character == -3) {
              // choose a random pick
              // first find all picks and bans chosen
              let infoIds = [];
              for (let i = 0; i < gameResult.bans.length; i++) {
                infoIds.push(gameResult.bans[i]._id);
                infoIds.push(gameResult.pickst1[i]._id);
                infoIds.push(gameResult.pickst2[i]._id);
              }
              infoIds = [...new Set(infoIds)];
              let newestPick = await character.findOne().sort({ _id: -1 });
              newestPick = newestPick._id;
              // find last id

              // generate random number
              let randomVal = -1;
              while (randomVal < 0 || infoIds.includes(randomVal)) {
                randomVal = Math.floor(Math.random() * (newestPick + 1));
              }
              info.data.character = randomVal;
            }
            const charPick = await character.findById(info.data.character);
            if (
              charPick == null ||
              (await checkCharacterExists(info.id, charPick))
            ) {
              info.data.character = -3;
              return await addItems(info);
            }
            // add picks accordingly based on team
            const swapt1 = [0, 2, 4, 5];
            const swapt2 = [1, 2, 3, 5];
            // find first empty pick
            let ind = -1;
            let newTeam = 0;
            if (info.data.team == 2) {
              for (let i = 0; i < gameResult.pickst2.length; i++) {
                if (gameResult.pickst2[i]._id == -1) {
                  ind = i;
                  charPick.chosen = true;
                  gameResult.pickst2[i] = charPick;
                  break;
                }
              }
              for (let i = 0; i < swapt2.length; i++) {
                if (ind == swapt2[i]) {
                  // found a boundary for team 2 - now it is team 1's turn to pick
                  if (i == 1) {
                    // bandage solution - third pick goes back to one more set of bans, where team 2 starts
                    newTeam = -2;
                    gameResult.result = "ban";
                  } else {
                    newTeam = 1;
                  }
                  break;
                }
              }
              if (newTeam == 0) {
                // not a boundary - team 2 go again
                newTeam = 2;
              }
            } else {
              for (let i = 0; i < gameResult.pickst1.length; i++) {
                if (gameResult.pickst1[i]._id == -1) {
                  ind = i;
                  charPick.chosen = true;
                  gameResult.pickst1[i] = charPick;
                  break;
                }
              }
              swapt1.forEach((val) => {
                if (ind == val) {
                  newTeam = 2;
                }
              });
              if (newTeam == 0) {
                newTeam = 1;
              }
            }
            timestampInfo.find((val) => val.id == info.id).timestamp = PICK_TIMER; 
            if (ind == swapt1[swapt1.length - 1] && info.data.team == 1) {
              // first team has very last pick
              newTeam = -1;
              gameResult.result = "progress";
              const indexToRemove = timestampInfo.findIndex(
                (val) => val.id == info.id
              );
              console.log("time to end");
              if (indexToRemove != -1) {
                // remove to prevent it from continuing to run
                timestampInfo.splice(indexToRemove, 1);
                console.log("ending");
              }
              // remove game here
            }
            newTeam < 0
              ? (gameResult.turn = -1 * newTeam)
              : (gameResult.turn = 1 * newTeam);
            await gameResult.save();
            // find the first index at which
            return JSON.stringify({
              message: "Success",
              type: "pick",
              pick: info.data.character,
              team: info.data.team,
              id: info.id,
              nextTeam: newTeam,
            });
          }
          default:
            return JSON.stringify({
              message: "Failure",
              errType: "Add",
              error: "Please choose to add a boss, ban, or pick only.",
            });
        }
    }
    catch(err){
      console.log(err);
      let errVal =  (development == "development") ? err.toString() : "An error occurred";
      return JSON.stringify({
        message: "Failure",
        errType: "server",
        error: errVal,
      });
    }
}

const addTimes = async (info) => {
  // update the current times
  // info.data is in format of a three digit array: [team (1 or 2), boss number (0 to 6 or 8 depends on division), new time]
  try{
    let timeInfo = info.data;
    if (typeof timeInfo === "undefined" || timeInfo.length != 3) {
      return JSON.stringify({
        message: "Failure",
        errType: "Time",
        error: "Please provide a valid set of time information."
      });
    }
    if(typeof timeInfo[2] != "number" || isNaN(timeInfo[2])){
      return JSON.stringify({
        message: "Failure",
        errType: "Time",
        error: "Please provide a valid time."
      });
    }
    // verify the team number and boss number are valid
    // find game and get times of both teams
    const gameResult = await game.findById(info.id);
    if (gameResult == null) {
      return JSON.stringify({
        message: "Failure",
        errType: "Nonexistent",
        error: "The id is not valid for a current game.",
      });
    }
    let currentTimes = [gameResult.timest1, gameResult.timest2];
    
    // change the time
    currentTimes[timeInfo[0] - 1][timeInfo[1]] = timeInfo[2];
    // save
    await gameResult.save();
    // sends back the same time array
    return JSON.stringify({
      message: "Success",
      type: "times",
      time: info.data,
      id: info.id,
      game: gameResult
    });
  }
  catch(err){
    console.log(err);
    let errVal =
      development == "development" ? err.toString() : "An error occurred";
    return JSON.stringify({
      message: "Failure",
      errType: "server",
      error: errVal,
    });
  }
}
const switchPhase = async (ID, phase) => { 
    // change state - drafting (setup), playing (progress), game over (finish)
    // send this info back to everyone
  try{
      phase = phase.toLowerCase();
      let cond = false;
      const keywords = ["waiting","setup","boss", "ban", "pick", "progress","finish","1","2"]
      keywords.forEach(word => {
        if(word === phase){
          cond = true;
          if(phase == "1"){
            phase = "Team 1 Wins"
          }
          else if(phase == "2"){
            phase = "Team 2 Wins"
          }
        }
      })
      if(!cond){
          return JSON.stringify({
            message: "Failure",
            errType: "Phase",
            error: "Please provide a valid phase.",
          });
      }
      let updated = await game.findByIdAndUpdate(ID, {result: ""+phase}).lean(); // lean since info not needed
      // if change phase to boss, game started, so add timer
      if(phase == "boss"){
        console.log("added timer");
        timestampInfo.push({
          "id": ID, 
          "timestamp": PICK_TIMER
        });
        // do i really need extraban / pick? meh, the frontend handles this too
      }
      else if(phase == "progress"){
        const indexToRemove = timestampInfo.findIndex((val) => val.id == ID);
        console.log("time to end");
        if(indexToRemove != -1){ // remove to prevent it from continuing to run
          timestampInfo.splice(indexToRemove, 1);
          console.log("ending");
        }
      }
      if (updated == null) {
        return JSON.stringify({
          message: "Failure",
          errType: "Nonexistent",
          error: "The id is not valid for a current game.",
        });
      }
      return JSON.stringify({
        message: "Success",
        type: "phase",
        newPhase: phase,
        game: updated,
        id: updated._id
      });
  }
  catch(err){
    console.log(err);
    let errVal =
      development == "development" ? err.toString() : "An error occurred";
    return JSON.stringify({
      message: "Failure",
      errType: "server",
      error: errVal,
    });
  }
    
}
const findTurn = async(id, getSelectionInfo = false) => {
  const foundGame = await game.findById(id).lean();
  if(foundGame == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  else if(getSelectionInfo){
    let stamp = timestampInfo.find((val) => val.id == id); 
    let timer = -1;
    if(stamp != undefined){
      timer = stamp.timestamp;
    }
    return JSON.stringify({
      message: "Success",
      type: "turn",
      turn: foundGame.turn,
      id: id,
      timer: timer,
      requesterOnly: true
    });
  }
  else{
    return JSON.stringify({
      message: "Success",
      type: "turn",
      turn: foundGame.turn,
      id: id,
      requesterOnly: true
    });
  }
  
}

const getInformation = async(query) => {
  if(query == "boss"){
    // find bosses
    const bosses = await boss.find({}).lean();
    return JSON.stringify({
      message: "Success",
      boss: true,
      type: "query",
      bossList: bosses,
      requesterOnly: true,
    });
  }
  else if(query == "character"){
    const characters = await character.find({}).lean();
    return JSON.stringify({
      message: "Success",
      type: "query",
      character: true,
      characterList: characters,
      requesterOnly: true,
    });
  }
}

const checkPlayers = async(info) => {
  const gameInfo = await game.findById(info);
  if (gameInfo == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  let resArr = [];
  for(let i = 0; i < gameInfo.connected.length; i++){
    if(i < 2){
      if(gameInfo.connected[i] == 1){
        resArr.push(true);
      }
      else{
        resArr.push(false);
      }
    } // always players
    else{
      if (gameInfo.connected[i] >= 2) {
        resArr.push(true);
      } else {
        resArr.push(false);
      }
    }
  }
  return JSON.stringify({
    message: "Success",
    type: "players",
    playerStatus: resArr,
    id: info,
    requesterOnly: true
  });
}

/**
 * Sends the new team information to the database. Updates pick orders as well.
 * @param {*} info the json string parsed as data
 * This data includes player and team names, and pick orders.
 * team is either 1 or 2 always.
 */
const updateTeam = async(info) => {
  const gameInfo = await game.findById(info.id);
  if (gameInfo == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  if (new Set(info.data.order).size != info.data.order.length) {
    return JSON.stringify({
      message: "Failure",
      errType: "Team",
      error: "Please make sure each player has two characters.",
    });
  }
  let newPicks = [];
  if (info.team != 1 && info.team != 2) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "Please make sure to select a valid team number!",
    });
  }
  if(gameInfo.result.toLowerCase() == "progress" && new Set(info.data.order).size == info.data.order.length){
    let picksList = [];
    for (let i = 0; i < gameInfo.pickst1.length; i++) {
      picksList.push(gameInfo[`pickst${info.team}`][info.data.order[i]]); // copy data from old array and move to new
      newPicks.push(info.data.order[i])
      console.log(newPicks);
    }
    gameInfo[`pickst${info.team}`] = picksList;
  }
  else{
    newPicks = [0, 1, 2, 3, 4, 5]; // fix order
  }
  gameInfo[`team${info.team}`] = info.data.teamName;
  gameInfo[`playerst${info.team}`] = info.data.playerNames;
  
  await gameInfo.save();
  return JSON.stringify({
    message: "Success",
    type: "TeamUpdate",
    game: gameInfo,
    team: info.team,
    id: info.id,
    teamName: info.data.teamName,
    order: newPicks,
    playerNames: info.data.playerNames,
  });
}

const updateStatus = async (info) => {
  const gameInfo = await game.findById(info.id);
  // console.log(gameInfo);
  let failed = false;
  if(gameInfo == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game."
    })
  }
  switch(info.team){
    case 1:
      switch(info.menu.toLowerCase()){
        case "penalty": {
          gameInfo.penaltyt1[info.data.bossIndex] = info.data.status;
          gameInfo.markModified('penaltyt1');
          break;
        }
        case "death": {
          gameInfo.deatht1[info.data.bossIndex] = info.data.status;
          gameInfo.markModified('deatht1');
          break;
        }
        default:
          failed = true;
          break;
      }
      break;
    case 2:
      switch (info.menu.toLowerCase()) {
        case "penalty": {
          gameInfo.penaltyt2[info.data.bossIndex] = info.data.status;
          gameInfo.markModified("penaltyt2");
          break;
        }
        case "death": {
          gameInfo.deatht2[info.data.bossIndex] = info.data.status;
          gameInfo.markModified("deatht2");
          break;
        }
        default:
          failed = true;
          break;
      }
      break;
    default:
      failed = true;
      break;
  }
  if(failed){
    return JSON.stringify({
      message: "Failure",
      errType: "status",
      error: "Please ensure all necessary status info is posted."
    })
  }
  await gameInfo.save();
  return JSON.stringify({
    message: "Success",
    type: "status",
    menu: info.menu,
    team: info.team,
    id: info.id,
    bossIndex: info.data.bossIndex,
    status: info.data.status
  })
};

const findAllIds = async(id) => {
  const gameInfo = await game.findById(id);
  if(gameInfo == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  let bossIds = [];
  let charIds = [];
  for(let i = 0; i < gameInfo.bosses; i++){
    bossIds.push(gameInfo.bosses[i]._id)
    if(i < gameInfo.bans.length){
      charIds.push(gameInfo.bans[i]._id);
    }
    if(i < gameInfo.pickst1.length){
      charIds.push(gameInfo.pickst1[i]._id);
      charIds.push(gameInfo.pickst2[i]._id);
    }
  }
  bossIds = [...new Set(bossIds)];
  charIds = [...new Set(charIds)];
  let bossInd = bossIds.indexOf(-1);
  let charInd = charIds.indexOf(-1);
  if(bossInd != -1){
    bossIds.splice(bossInd, 1);
  }
  if(charInd != -1){
    charIds.splice(charInd, 1);
  }
  return JSON.stringify({
    message: "Success",
    type: "selections",
    id: id,
    bosses: bossIds,
    chars: charIds,
    requesterOnly: true
  });
}
const pauseGame = async(id) => {
    // remove from timestampinfo
  const indexToRemove = timestampInfo.findIndex((val) => val.id == id);
  if(indexToRemove != -1){ // remove to prevent it from continuing to run
    let result = timestampInfo.splice(indexToRemove, 1);
    pausedInfo.push(result);
  }
  return JSON.stringify({
    message: "Success",
    type: "pause",
    id: id
  })

}
const resumeGame = async(id) => {
  const indexToRemove = pausedInfo.findIndex((val) => val.id == id);
  if (indexToRemove != -1) {
    // remove to let it run again
    let result = pausedInfo.splice(indexToRemove, 1);
    timestampInfo.push(result);
  }
  return JSON.stringify({
    message: "Success",
    type: "resume",
    id: id,
  });
}

const checkAmounts = (data, division, type) => {
    // checks the number of bans / picks / bosses is valid, not too many - data is the array
    if (type == "boss") {
        if (division.toLowerCase() == "premiere") {
          // 9 bossses, otherwise 7
          return data.length <= 9
        } else {
            return data.length <= 7
        } 
    } else { 
        return data.length <= 6
    }
    
}

/**
 * Checks if the target boss (information in the value section) has been selected in the current game.
 * @param {Number} ID the game ID
 * @param {Boolean} long if the boss is a long boss or not
 * @param {Number} team the team that chose this boss
 * @param {String} boss the name of the boss
 * @returns true if the character is found, false if not
 */
const checkExists = async (ID, long, team, boss) => {
  // check for premier or not
  // query the game for the corresponding item
  let targetGame = await game.findById(ID);
  let check = targetGame.get("bosses");
  // convert to strings and see if one includes the other
  check = JSON.stringify(check);
  if(check.includes('"long":true')){ // checks current bosses and long boss, but does not check if the boss is actually long
    console.log("long found"); // just to check program can detect a long boss being chosen
    if (targetGame.longBoss[team - 1] && long){ 
      return true;
    } // prevent a second long boss from being chosen
  }
  if(check.includes(boss)){
    console.log("general found");
    return true;
  }
  console.log("general not found");
  return false;
}
/**
 * Checks if the target character (information in the value section) has been banned or picked in the current game.
 * @param {Number} ID the game ID
 * @param {Object} value the JSON string of the character you are checking
 * @returns true if the character is found, false if not
 */
const checkCharacterExists = async(ID, value) => {
  if(value == null){
    return true; // not because it exists, but instead because it should throw an error
  }
  let targetGame = await game.findById(ID);
  let t1 = JSON.stringify(targetGame.get("pickst1"));
  let t2 = JSON.stringify(targetGame.get("pickst2"));
  let bans = JSON.stringify(targetGame.get("bans"));
  let extrabans = JSON.stringify(targetGame.get("extrabans"));
  let total = t1 + t2 + bans + extrabans;
  if (total.includes(value.name)) {
    return true;
  } else {
    return false;
  }
}

server.listen(PORT, '::', () => console.log("connected!"));   