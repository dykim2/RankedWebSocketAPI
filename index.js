const express = require('express');
require("dotenv").config();
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({server: server})
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT || 8080;
const development = process.env.NODE_ENV;
const host = process.env.HOSTNAME;
const mongoose = require("mongoose");
const character = require("./models/characterModel.js")
const boss = require("./models/bossModel.js");
const game = require('./models/gameModel.js');
const PICK_TIMER = 455; // 48 - 480 seconds for players to make a pick
// if timer runs out everything becomes random
let interval = null;

let timestampInfo = []; // array of game ids with timestamps
let pausedInfo = []; // paused game info - game timestamp info here is saved and is not changed
// format is as follows
const messageMap = new Map();
let newestCharacter = 0;
let newestBoss = 0;
/*
  {
    "id": id,
    "timestampt1": timestampt1,
    "timestampt2": timestampt2,
    "turn": 1 | 2
` }
*/

try{
  wss.on('connection', function connection(ws, req) {
    startInterval();
    console.log("Total clients:", wss.clients.size);
    // check for latest character
    ws.on('message', async function incoming(message){
        const jsonStr = JSON.parse(message);
        console.log(jsonStr);
        const gameResult = await game.findById(jsonStr.id);
        // console.log(jsonStr);
        if (gameResult != null) {
          gameResult.log += message + " \n\n ";
        }
        switch(jsonStr.type){
          case "character":
          case "boss":
          case "add":
            const currTime = Date.now();
            if(messageMap.has(jsonStr.id)){
              // to make sure double clicks arent triggered, check that each request was at least 1.5s apart (gifs playing should mean this is never accidentally triggered)
              const lastTime = messageMap.get(jsonStr.id);
              if(currTime - lastTime < 1500){
                ws.send(JSON.stringify({
                  message: "Failure",
                  errType: "Multiclick",
                  error: "Clicking too fast!",
                }));
                return;
              }
              else{
                messageMap.set(jsonStr.id, currTime);
              }
            }
            else{
              messageMap.set(jsonStr.id, currTime);
            }
            break;
        }
        // calling options: 
        let result = ""; // should be a JSON string
        switch(jsonStr.type){
          case "get":
              result = await getGame(jsonStr.id, false);
              break;
          case "refresh": 
              result = await getGame(jsonStr.id, true); // difference is this method probably wont return times
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
              result = await addItems(jsonStr, false);
              break;
          case "times":
              result = await addTimes(jsonStr);
              break;
          case "switch":
              result = await switchPhase(jsonStr.id, jsonStr.phase);
              break;
          case "dnd":
              result = await handleDND(jsonStr);
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
          case "overwrite":
              result = await overwrite(jsonStr);
              break;
          case "names":
              result = await updateNames(jsonStr);
              break;
          case "teamname":
              result = await updateTeamNames(jsonStr);
              break;
          case "ids":
              result = await findAllIds(id);
              break;
          case "pause":
              result = await pauseGame(jsonStr.id);
              break;
          case "resume": 
              result = await resumeGame(jsonStr.id);
              break;
          case "latest":
              result = await findLatest(jsonStr.id);
              break;
          default:
              result = JSON.stringify({message: "Failure", errType: "Nonexistent", error: "Please enter a valid selection."});
              break;
            // add a few extra options
        }
        
        if (messageMap.has(jsonStr.id)) {
          messageMap.delete(jsonStr.id);
        }
        // ws.send("message obtained: " + message); 
        // console.log("-----------------")
        // console.log(result);
        
        let resCopy = JSON.parse(result);
        if(resCopy.message == "Failure" || resCopy.requesterOnly){
          ws.send(result); // send only back to the user
        }
        else{ // on a character selection, user switch, pick add, etc, etc. send to every client including the picker
          // console.log("send to client in general");
          // console.log(result);
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
    ws.on('close', () => {
      console.log("client dc");
    })
  })
}
catch(err){
  console.log(err);
}
mongoose
  .connect(MONGO_URL)
  .then(() => {
    character.findOne().sort({_id: -1}).then((doc => {
      newestCharacter = doc._id;
      console.log("update character");
    }));
    boss.findOne().sort({_id: -1}).then((doc => {
      newestBoss = doc._id;
      console.log("update boss");
    }));
  })
  .catch((err) => {
    console.log(err);
  });

const startInterval = () => {
  if(interval){
    return;
  }
  interval = setInterval(async () => {
    // where to store times
    // decide to only update times on connecting to websocket or on a pick / ban

    Object.entries(timestampInfo).forEach(async ([gameID, value]) => {
      // check if the time is greater than 0, set to PICK_TIMER by default
      if (value[`timestampt${value.turn}`] >= 0) {
        value[`timestampt${value.turn}`] -= 1; // change this to represent each individual timestamp
      } else {
        // if time is up, run a function that essentially randoms the pick and resets the timer
        // first checks for hover
        let gameResult = await game.findById(value.id);
        let hovered = -3;
        if(gameResult != null){
          if (gameResult.hovered[gameResult.turn - 1] != -1) {
            hovered = gameResult.hovered[gameResult.turn - 1];
          }
          if(!messageMap.has(value.id)){
            // change newInfo accordingly
            let newInfo = {
              id: value.id,
              type: "add",
              changed: gameResult.result,
              data: {
                boss: hovered,
                ban: hovered,
                character: hovered,
                team: gameResult.turn,
              },
            };
            value[`timestampt${value.turn}`] = 6; // if timer really goes to 0, take hover and then set timer to 6s, barely enough to let the gifs play out
            // pause timer?
            let hoverResult = await addItems(newInfo, false);
            gameResult.log += hoverResult + "\n(hover result above)\n\n";
            await gameResult.save();
            // make sure to remove at the end
            //
            // let thisResult = await addItems(newInfo);
            // send the result to all clients

            console.log("send to client on hover");
            console.log(hoverResult);
            wss.clients.forEach(function each(client) {
              // send data back to all connected clients
              if (client.readyState === WebSocket.OPEN) {
                client.send(hoverResult);
                // this is successful so far
                // next, grab phase from game info
                // send to additem
              }
            });
          }
        }
      }
      // return the values whenever a connection is made from a client
      // send a request on open socket
    });
    // create a global variable that stores the time, i think this is fine because times will disappear on restart but are not that important to store
  }, 1000);
}
const stopInterval = () => {
  if(interval){
    clearInterval(interval);
    interval = null;
  }
}
// next goal: bug fix + 3rd ban

const getGame = async(data, isRefresh) => {
  const res = await game.findById(data).lean();
  let ind = 0;
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
    // check if game is in timestampinfo or pausedinfo
    ind = getResumedGame(data); // is it a game that can be resumed?
    let paused = false;
    if(ind != -1){
      paused = true;
    }
    else{
      ind = getPausedGame(data);
      if(ind == -1){
        // not started game, safe to send default game timer
      }
    }
    console.log("ind");
    console.log(ind);
    // if game doesnt exist, preset times to -1 and then game will auto fill with default time
    // pass this time on to a game on refresh game info, but subtract 1 second or do what the get time does
    return JSON.stringify({
      message: "Success",
      type: isRefresh ? "refresh" : "get",
      game: res,
      id: res._id,
      paused: paused,
      timert1: isRefresh ? undefined : ind.timestampt1 ?? res.totalTimeT1 ?? PICK_TIMER,
      timert2: isRefresh ? undefined : ind.timestampt2 ?? res.totalTimeT2 ?? PICK_TIMER,
      requesterOnly: true
    });
  }
}

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
  // let pick stay as is
  let returnInfo = JSON.stringify({
    message: "success",
    type: "complete",
    requesterOnly: true
  });
  gameResult.log += returnInfo + " \n\n ";
  await gameResult.save();
  return returnInfo;
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
  return addItems(newInfo, false);
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
  return addItems(newInfo, false);
}
/***
 * Adds items to the game as selected by players.
 * @param info the game information
 * @param inside whether this is called inside itself or by an outside function
 * @return a JSON string that contains the result of this add operation
 */
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
      });
      // info.data.team = gameResult.turn;
    }
    let allPicks = []; // used to find matches for characters chosen
    allPicks = allPicks.concat(gameResult.bans, gameResult.extrabans, gameResult.pickst1, gameResult.pickst2);
    switch (info.changed) {
      case "bossban": {
        // handle boss bans here, these go before normal bans
        if (info.data.boss == -3) {
          info.data.boss = -2;
        }
        // allow players to ban bosses already banned in fearless, its still a no ban
        if (
          gameResult.bossBans.includes(info.data.boss) && info.data.boss >= 0  || info.data.boss > newestBoss
        ) {
          // no boss ban
          info.data.boss = -2;
        }
        let firstEmpty = gameResult.bossBans.findIndex((val) => val == -1);
        let last = false;
        if (firstEmpty != -1) {
          gameResult.bossBans[firstEmpty] = info.data.boss;
          if (firstEmpty == gameResult.bossBans.length - 1) {
            last = true;
          }
        }
        if (last) {
          newTeam = -1;
          gameResult.result = "boss";
          gameResult.turn = 1;
        } else {
          newTeam = info.data.team == 1 ? 2 : 1;
          gameResult.turn = newTeam;
        }
        adjustGameTimer(info.id, info.data.team, newTeam);
        let returnInfo = JSON.stringify({
          message: "Success",
          type: "bossban",
          ban: info.data.boss,
          id: info.id,
          team: info.data.team,
          nextTeam: newTeam,
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
      }
      case "boss": {
        if(info.data.boss == -3){
          // choose a random boss
          // first find all bosses chosen
          let bossIds = [...gameResult.bosses];
          if(gameResult.doBossBans){
            bossIds = bossIds.concat(gameResult.bossBans);
          }
          // find last id and generate random number
          let randomVal = -1; 
          let valid = true;
          // boss randomizer
          while(randomVal < 0 || bossIds.includes(randomVal) || gameResult.bossBans.includes(randomVal) || valid == false){
            randomVal = Math.floor(Math.random() * (newestBoss + 1));
            let newInfo = await boss.findById(randomVal); // bottleneck????
            if (gameResult.fearless) {
              if (gameResult.fearlessBosses.includes(randomVal)) {
                valid = false;
              }
            }
            if((newInfo.type == "legend" && gameResult.division != "premier") || (newInfo.type == "weekly" && gameResult.division == "open")){
              valid = false;
            }
            else if (gameResult.longBoss[info.data.team - 1] && newInfo.long == true) {
              valid = false;
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
            return await addItems(info, true);
          }
        }
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
        const findBoss = await boss.findById(info.data.boss);
        if (
          findBoss == null || findBoss == undefined || checkExists(gameResult.bosses, gameResult.longBoss[info.data.team - 1], info.data.boss, findBoss.long)
        ) {
          // instead of forcing an error, randomize it, mainly for the case of hovering
          info.data.boss = -3;
          console.log("boss exists already!");
          return await addItems(info, true);
        }
        if (findBoss.type == "legend" && gameResult.division != "premier") {
          console.log("boss is premier!");
          info.data.boss = -3;
          return await addItems(info, true);
        }

        let firstEmpty = gameResult.bosses.findIndex((val) => val == -1);
        if (firstEmpty != -1) {
          gameResult.bosses[firstEmpty] = info.data.boss;
          if (firstEmpty == gameResult.bosses.length - 1) {
            last = true;
          }
          if(findBoss.long){
            gameResult.longBoss[info.data.team - 1] = true;
          }
        }
        else{
          // this should never trigger
          console.log("An error occurred with finding bosses!");
          // notify dev somehow
        }
        
        let newTeam = 0; // switch teams
        switch (info.data.team) {
          case 1:
            newTeam = 2;
            break;
          case 2:
            newTeam = 1;
            break;
          default:
            let returnInfo = JSON.stringify({
              message: "Failure",
              errType: "Nonexistent",
              error: "Please provide a valid team to select.",
            });
            gameResult.log += returnInfo + "\n\n";
            await gameResult.save();
            return returnInfo;
        }
        if (last) {
          gameResult.result = "ban";
          newTeam = -1;
        } 
        // add new boss, save. and return a message
        adjustGameTimer(info.id, info.data.team, newTeam);
        newTeam < 0 ? gameResult.turn = -1 * newTeam : gameResult.turn = newTeam;
        let returnInfo = JSON.stringify({
          message: "Success",
          type: "boss",
          id: info.id,
          boss: info.data.boss,
          long: findBoss.long,
          team: info.data.team,
          nextTeam: newTeam,
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
      }
      case "extraban": {
        // handle extra bans here, these go before normal bans
        if (info.data.character == -3) {
          info.data.character = -2; // random ban means no ban
        }
        const charPick = await character.findById(info.data.character);
        let status = checkCharacterExists(allPicks, info.data.character);
        if (
          charPick == null ||
          (status && info.data.character != -2 && info.data.character != -1)
        ) {
          info.data.character = -2;
          console.log("charpick was null");
          // also sets the no ban if found already
          return await addItems(info, true); // forces no ban in case of a bug
        }
        // first check if the character even exists
        let last = false; // for last team this is default
        let newTeam = 1;
        let firstEmpty = gameResult.extrabans.findIndex(
          (val) => val == -1
        );
        if (firstEmpty != -1) {
          charPick.chosen = true;
          gameResult.extrabans[firstEmpty] = info.data.character;
          if (firstEmpty == gameResult.extrabans.length - 1) {
            // check for last extra ban filled
            last = true;
          }
        }

        if (!last) {
          // find who is next - special loop exists because of the number of extra bans not being consistent
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
          gameResult.result = gameResult.doBossBans ? "bossban" : "boss";
          newTeam = -1; 
          gameResult.turn = 1;
        }
        adjustGameTimer(info.id, info.data.team, newTeam);
        let returnInfo = JSON.stringify({
          message: "Success",
          type: "extraban",
          id: info.id,
          ban: info.data.character,
          team: info.data.team,
          nextTeam: newTeam,
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
      }
      case "ban": {
        // get character by index from character model and add it to the bans
        if (info.data.character == -3) {
          info.data.character = -2; // random ban means no ban 
        }
        let status = checkCharacterExists(allPicks, info.data.character);
        if (status && info.data.character != -2 && info.data.character != -1){
          info.data.character = -2;
          return await addItems(info, true); // forces no ban
        }
        let last = 0;
        let firstEmpty = gameResult.bans.findIndex(val => val == -1);
        if(firstEmpty != -1){
          gameResult.bans[firstEmpty] = info.data.character;
          if (firstEmpty == gameResult.bans.length - 1) { // swaps to picks on 4th and 6th ban - this is 6th ban, should also work for 3 + 1
            last = 2;
          }
          else if(firstEmpty == gameResult.bans.length - 3){ // 4th ban
            last = 1;
          }
        }
        // add new bans, save, return message
        let newTeam = 0;
        if(last == 0){
          switch(info.data.team){
            case 1: 
              newTeam = 2;
              break;
            case 2:
              newTeam = 1;
              break;
          }
          gameResult.turn = newTeam;
        }
        else {
          newTeam = -1 * last;
          gameResult.result = "pick";
          gameResult.turn = last;
        }
        adjustGameTimer(info.id, info.data.team, newTeam);
        let returnInfo = JSON.stringify({
          message: "Success",
          type: "ban",
          ban: info.data.character,
          id: info.id,
          team: info.data.team,
          nextTeam: newTeam,
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
      }   
      case "pick": {
        // get character by index from character model and add it to the picks
        if (info.data.character == -3) {
          // choose a random pick
          // first find all picks and bans chosen
          let infoIds = [...new Set(allPicks)];
          // generate random number
          let randomVal = -1;
          // TODO when flins releases remove 103
          // i used to have a reconnection algorithm... i forgot how but i think i need to re-add it 
          while (randomVal < 0 || infoIds.includes(randomVal) || randomVal == 103) {
            randomVal = Math.floor(Math.random() * (newestCharacter + 1));
          }
          info.data.character = randomVal;
        }
        const charPick = await character.findById(info.data.character);
        if (
          charPick == null ||
          (checkCharacterExists(allPicks, info.data.character))
        ) {
          info.data.character = -3;
          return await addItems(info, true);
        }
        // add picks accordingly based on team
        const swapt1 = [0, 2, 4, 5];
        const swapt2 = [1, 2, 3, 5];
        // find first empty pick
        let ind = gameResult[`pickst${info.data.team}`].findIndex(val => val == -1);
        if(ind == -1){
          // this should never trigger but return an error anyways
          console.log("An error occurred with finding picks!");
        }
        gameResult[`pickst${info.data.team}`][ind] = info.data.character;
        let newTeam = 0;
        if (info.data.team == 2) {
          for (let i = 0; i < swapt2.length; i++) {
            if (ind == swapt2[i]) {
              // found a boundary for team 2 - now it is team 1's turn to pick
              if (i == 1) {
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
          swapt1.forEach((val) => {
            if (ind == val) {
              newTeam = 2;
            }
          });
          if (newTeam == 0) {
            newTeam = 1;
          }
        }
        adjustGameTimer(info.id, info.data.team, newTeam);
        if (ind == swapt1[swapt1.length - 1] && info.data.team == 1) {
          // first team has very last pick
          newTeam = -1;
          gameResult.result = "progress";
          const indexToRemove = timestampInfo.findIndex(
            (val) => val.id == info.id
          );
          if (indexToRemove != -1) {
            // remove to prevent it from continuing to run
            timestampInfo.splice(indexToRemove, 1);
          }
          // note: remove game here
          if(messageMap.has(info.id)){
            messageMap.delete(info.id);
          }
        }
        newTeam < 0
          ? (gameResult.turn = -1 * newTeam)
          : (gameResult.turn = 1 * newTeam);
        let returnInfo = JSON.stringify({
          message: "Success",
          type: "pick",
          pick: info.data.character,
          team: info.data.team,
          id: info.id,
          nextTeam: newTeam,
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
      }
      default:
        let returnInfo = JSON.stringify({
          message: "Failure",
          errType: "Add",
          error: "Please choose to add a boss, ban, extraban, boss ban, or pick only.",
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
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

// not used atm
/**
 * add times to website. website does not display times, please do not use.
 * @param {*} info 
 * @returns a message with the times and id
 */
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
    // sends back the same time array
    let returnInfo = JSON.stringify({
      message: "Success",
      type: "times",
      time: info.data,
      id: info.id,
    });
    gameResult.log += returnInfo + "\n\n";
    await gameResult.save();
    return returnInfo;
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
    let gameResult = await game.findById(ID);
    if (gameResult == null) {
      return JSON.stringify({
        message: "Failure",
        errType: "Nonexistent",
        error: "The id is not valid for a current game.",
      });
    }
    phase = phase.toLowerCase();
    let cond = false;
    const keywords = ["waiting", "setup", "boss", "bossban", "extraban", "ban", "pick", "progress", "finish", "1", "2"]
    keywords.forEach(word => {
      if(word === phase){
        cond = true;
      }
    })
    if(!cond){
      let returnInfo = JSON.stringify({
        message: "Failure",
        errType: "Phase",
        error: "Please provide a valid phase.",
      });
      gameResult.log += returnInfo + "\n\n";
      await gameResult.save();
      return returnInfo;
    }
    gameResult.result = ""+phase;
    // if change phase to boss / bossban / extraban, game started, so add timer
    if((phase == "bossban" && gameResult.extrabans.length == 0 && gameResult.doBossBans) || (phase == "boss" && gameResult.extrabans.length == 0 && !gameResult.doBossBans) || (gameResult.extrabans.length > 0 && phase == "extraban")){
      if(gameResult.extrabans.length > 0 && phase == "extraban"){
        gameResult.turn = gameResult.extrabanst1 > 0 ? 1 : 2; // if t1 has extra bans, they go first, else t2 goes first
      }
      startGameTimer(ID, gameResult.turn, gameResult.totalTimeT1, gameResult.totalTimeT2);
    }
    else if(phase == "progress"){
      const indexToRemove = timestampInfo.findIndex((val) => val.id == ID);
      if(indexToRemove != -1){ // remove to prevent it from continuing to run
        timestampInfo.splice(indexToRemove, 1);
        if(messageMap.has(info.id)){
          messageMap.delete(info.id);
        }
      }
    }
    let returnInfo = JSON.stringify({
      message: "Success",
      type: "phase",
      id: gameResult._id,
      newPhase: phase,
      timerT1: gameResult.totalTimeT1,
      timerT2: gameResult.totalTimeT2,
      turn: gameResult.turn
    });
    gameResult.log += returnInfo + "\n\n";
    await gameResult.save();
    return returnInfo;
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
const handleDND = async(info) => {
  let gameResult = await game.findById(info.id);
  if(!(gameResult.result == "progress" || gameResult.result == "finish")){
    // do nothing
    // console.log("failed");
    return JSON.stringify({
      message: "Failure",
      errType: "wait",
      error: "Please do not drag and drop the bosses and characters until draft is over!"
    })
  }
  if(info.values[0] == info.values[1]){
    // do nothing, dropped back to original location
    // console.log("haha do nothing");
    return JSON.stringify({
      message: "Success",
      type: "complete",
      requesterOnly: true
    })
  }
  else{
    let returnInfo = "";
    let whereInfo = "";
    let firstInd = 0;
    let secondInd = 0;
    switch (info.where) {
      case "boss":
        whereInfo = "bosses";
        break;
      case "t1":
        whereInfo = "pickst1";
        break;
      case "t2":
        whereInfo = "pickst2";
        break;
      default:
        returnInfo = JSON.stringify({
          message: "Failure",
          errType: "wait",
          error:
            "Please choose an appropriate type of drag and drop to swap with.",
        });
        gameResult.log += returnInfo + "\n\n";
        await gameResult.save();
        return returnInfo;
    }
    firstInd = gameResult[whereInfo].indexOf(info.values[0]);
    secondInd = gameResult[whereInfo].indexOf(info.values[1]);
    if(firstInd == -1 || secondInd == -1){
      returnInfo = JSON.stringify({
        message: "Failure",
        errType: "swap",
        error: "Please choose valid characters / bosses to swap.",
      });
      gameResult.log += returnInfo + "\n\n";
      await gameResult.save();
      return returnInfo;
    }
    let temp = gameResult[whereInfo][firstInd];
    gameResult[whereInfo][firstInd] = gameResult[whereInfo][secondInd];
    gameResult[whereInfo][secondInd] = temp;
    returnInfo = JSON.stringify({
      message: "Success",
      type: "DND",
      id: info.id,
      where: whereInfo,
      first: firstInd,
      second: secondInd
    });
    gameResult.log += returnInfo + "\n\n";
    await gameResult.save();
    return returnInfo;
  }
}
const findTurn = async(id, getSelectionInfo = true) => {
  const gameResult = await game.findById(id);
  let returnInfo = "";
  if (gameResult == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  } else if (getSelectionInfo) {
    let stamp = timestampInfo.find((val) => val.id == id);
    let timert1 = -1;
    let timert2 = -1;
    let paused = false;
    if (stamp != undefined) {
      timert1 = stamp.timestampt1;
      timert2 = stamp.timestampt2;
    }
    else{
      let paused = pausedInfo.find((val) => val.id == id);
      if(paused != undefined){
        timert1 = paused.timestampt1;
        timert2 = paused.timestampt2;
        paused = true;
      }
    }

    returnInfo = JSON.stringify({
      message: "Success",
      type: "turn",
      turn: gameResult.turn,
      id: id,
      timert1: timert1,
      timert2: timert2,
      paused: paused,
      requesterOnly: true,
    });
  } else { 
    returnInfo = JSON.stringify({
      message: "Success",
      type: "turn",
      turn: gameResult.turn,
      id: id,
      paused: paused,
      requesterOnly: true,
    });
  }
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
}

// not needed anymore
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
  const gameResult = await game.findById(info);
  if (gameResult == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  let resArr = [];
  for (let i = 0; i < gameResult.connected.length; i++) {
    if (i < 2) {
      if (gameResult.connected[i] == 1) {
        resArr.push(true);
      } else {
        resArr.push(false);
      }
    } 
    else {
      if (gameResult.connected[i] >= 2) {
        resArr.push(true);
      } else {
        resArr.push(false);
      }
    }
  }
  let returnInfo = JSON.stringify({
    message: "Success",
    type: "players",
    playerStatus: resArr,
    id: info,
    requesterOnly: true
  });
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
}
const overwrite = async(info) => {
  // instead of limiting to after draft, limit to paused game only aka must be paused
  const gameResult = await game.findById(info.id);
  let choice = info.which == "boss" ? "bosses" : info.which == "bossban" ? "bossBans" : info.which == "character" ? "pickst"+info.team : info.which == "ban" ? "bans" : "extrabans"

  // let the frontend process if it is a name or an index and if so then send it
  console.log(info);
  console.log("info");
  // test
  let res = undefined;
  // info.original is now an index pass
  if(info.which == "boss" || info.which == "bossban"){
    res = await boss.findById(info.replacement);
  }
  else{
    res = await character.findById(info.replacement);
  }
  if(res == undefined){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "Please choose a boss or character that exists!",
    });
  }
  if(res != null){
    gameResult[`${choice}`][info.original] = info.replacement; 
    await gameResult.save();
  }
  else{
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "Please choose a boss or character with a valid ID!"
    })
  }
  let returnInfo = JSON.stringify({
    message: "Success",
    type: "overwrite",
    id: info.id,
    which: choice,
    original: info.original,
    replacement: info.replacement
  });
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
}
const updateNames = async(info) => {
  const gameResult = await game.findById(info.id);
  if (gameResult == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  gameResult[`playerst${info.team}`] = info.newNames;
  await gameResult.save();
  return JSON.stringify({
    message: "Success",
    type: "names",
    id: info.id,
    team: info.team,
    names: info.newNames
  })
}
const updateTeamNames = async(info) => {
  if (info.team != 1 && info.team != 2) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The specified team is invalid.",
    });
  }
  const gameResult = await game.findById(info.id);
  if(gameResult == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  gameResult[`team${info.team}`] = info.newName;
  await gameResult.save();
  return JSON.stringify({
    message: "Success",
    type: "teamname",
    id: info.id,
    team: info.team,
    newName: info.newName,
  });
}

/**
 * Sends the new team information to the database. Updates pick orders as well.
 * @param {*} info the json string parsed as data
 * This data includes player and team names, and pick orders.
 * team is either 1 or 2 always.
 * this is not in use anymore
 * @deprecated please use the drag and drop and clicking on player / team names instead.
 */
const updateTeam = async(info) => {
  const gameResult = await game.findById(info.id);
  if (gameResult == null) {
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  if (new Set(info.data.order).size != info.data.order.length) {
    let returnInfo = JSON.stringify({
      message: "Failure",
      errType: "Team",
      error: "Please make sure each player has two characters.",
    });
    gameResult.log += returnInfo + "\n\n";
    await gameResult.save();
    return returnInfo;
  }
  let newPicks = [];
  if (info.team != 1 && info.team != 2) {
    let returnInfo = JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "Please make sure to select a valid team number!",
    });
    gameResult.log += returnInfo + "\n\n";
    await gameResult.save();
    return returnInfo;
  }
  if(gameResult.result.toLowerCase() == "progress" && new Set(info.data.order).size == info.data.order.length){
    let picksList = [];
    for (let i = 0; i < gameResult.pickst1.length; i++) {
      picksList.push(gameResult[`pickst${info.team}`][info.data.order[i]]); // copy data from old array and move to new
      newPicks.push(info.data.order[i])
      console.log(newPicks);
    }
    gameResult[`pickst${info.team}`] = picksList;
  }
  else{
    newPicks = [0, 1, 2, 3, 4, 5]; // fix order
  }
  gameResult[`team${info.team}`] = info.data.teamName;
  gameResult[`playerst${info.team}`] = info.data.playerNames;
  let returnInfo = JSON.stringify({
    message: "Success",
    type: "TeamUpdate",
    team: info.team,
    id: info.id,
    teamName: info.data.teamName,
    order: newPicks,
    playerNames: info.data.playerNames,
  });
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
}

// not used anymore, if used again will properly update code
const updateStatus = async (info) => {
  const gameResult = await game.findById(info.id);
  // console.log(gameResult);
  let failed = false;
  if(gameResult == null){
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
          gameResult.penaltyt1[info.data.bossIndex] = info.data.status;
          gameResult.markModified('penaltyt1');
          break;
        }
        case "death": {
          gameResult.deatht1[info.data.bossIndex] = info.data.status;
          gameResult.markModified('deatht1');
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
          gameResult.penaltyt2[info.data.bossIndex] = info.data.status;
          gameResult.markModified("penaltyt2");
          break;
        }
        case "death": {
          gameResult.deatht2[info.data.bossIndex] = info.data.status;
          gameResult.markModified("deatht2");
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
  let returnInfo = JSON.stringify({
    message: "Success",
    type: "status",
    menu: info.menu,
    team: info.team,
    id: info.id,
    bossIndex: info.data.bossIndex,
    status: info.data.status
  });
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
};
// not used atm
const findAllIds = async(id) => {
  const gameResult = await game.findById(id);
  if(gameResult == null){
    return JSON.stringify({
      message: "Failure",
      errType: "Nonexistent",
      error: "The id is not valid for a current game.",
    });
  }
  let bossIds = [];
  let charIds = [];
  let length = gameResult.bosses.length > gameResult.pickst1.length ? gameResult.bosses.length : gameResult.pickst1.length;
  for(let i = 0; i < length; i++){ 
    bossIds.push(gameResult.bosses[i])
    if(i < gameResult.bans.length){
      charIds.push(gameResult.bans[i]);
    }
    if(i < gameResult.pickst1.length){
      charIds.push(gameResult.pickst1[i]);
      charIds.push(gameResult.pickst2[i]);
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
  let returnInfo = JSON.stringify({
    message: "Success",
    type: "selections",
    id: id,
    bosses: bossIds,
    chars: charIds,
    requesterOnly: true
  });
  gameResult.log += returnInfo + "\n\n";
  await gameResult.save();
  return returnInfo;
}
const checkPause = (id) => {
  const indexToRemove = timestampInfo.findIndex((val) => val.id == id);
  if(indexToRemove != -1){ // remove to prevent it from continuing to run
    let result = timestampInfo.splice(indexToRemove, 1);
    // console.log("check pause result: ");
    // console.log(result);
    return result[0];
  }
  return -1;
}
/**
 * gets a game that will be paused (currently not paused)
 * @param {number} id 
 * @returns 
 */
const getPausedGame = (id) => {
  const ind = timestampInfo.findIndex((val) => val.id == id);
  // console.log("current play info:");
  // console.log(timestampInfo);
  if (ind != -1) {
    let result = timestampInfo[ind];
    return result;
  }
  return -1;
}
const pauseGame = async(id) => {
    // remove from timestampinfo
  let pauseRes = checkPause(id);
  let timert1 = -1;
  let timert2 = -1;
  if(pauseRes != undefined){
    pausedInfo.push(pauseRes);
    timert1 = pauseRes.timestampt1;
    timert2 = pauseRes.timestampt2;
  }
  return JSON.stringify({
    message: "Success",
    type: "pause",
    timert1: timert1,
    timert2: timert2,
    id: id
  })
}
const checkResume = (id) => {
  const indexToAdd = pausedInfo.findIndex((val) => val.id == id);
  if (indexToAdd != -1) {
    // remove to let it run again
    let result = pausedInfo.splice(indexToAdd, 1);
    // console.log("check resume result: ")
    // console.log(result);
    return result[0];
  }
  return -1;
}
const getResumedGame = (id) => {
  const ind = pausedInfo.findIndex((val) => val.id == id);
  // console.log("current paused info:")
  // console.log(pausedInfo);
  if(ind != -1){
    let result = pausedInfo[ind];
    return result;
  }
  return -1;
}
const resumeGame = async(id) => {
  let gameResult = await game.findById(id).lean();
  let resumeRes = checkResume(id);
  let timert1 = -1;
  let timert2 = -1;
  if(resumeRes != undefined){
    timestampInfo.push(resumeRes);
    timert1 = resumeRes.timestampt1;
    timert2 = resumeRes.timestampt2;
  }
  return JSON.stringify({
    message: "Success",
    type: "resume",
    timert1: timert1,
    timert2: timert2,
    turn: gameResult.turn,
    id: id,
  });
}

const findLatest = async(id) => {
  // newestBoss = await boss.findOne().sort({_id: -1})._id;
  // newestChar = await character.findOne().sort({_id: -1})._id;
  return JSON.stringify({
    message: "Success",
    type: "latest",
    id: id,
    boss: newestBoss,
    character: newestCharacter,
    requesterOnly: true
  });
}

/**
 * start a game with set id, who goes first and how much time each team has.
 * @param {number} ID the game id 
 * @param {number} startTurn the starting turn (default t1, t2 for extra ban stuff sometimes)
 * @param {number} totalTimeT1 the time team 1 has to do picks; defaults to 480s (8 mins) for every single boss ban, ban, and pick combined
 * @param {number} totalTimeT2 the time team 2 has to do picks; defaults to 480s (8 mins) for every single boss ban, ban, and pick combined
 */
const startGameTimer = (ID, startTurn, totalTimeT1 = PICK_TIMER, totalTimeT2 = PICK_TIMER) => {
  timestampInfo.push({
    id: ID,
    timestampt1: totalTimeT1,
    timestampt2: totalTimeT2,
    turn: startTurn
  });
}

/**
 * checks if game timer exists, if it does changes it
 * @param {number} ID the game id
 * @param {number} originalTurn the current turn
 * @param {number} newTurn the next turn (i.e. if t1 chooses not last boss then newTurn would be 2)
 */
const adjustGameTimer = (ID, originalTurn, newTurn) => {
  newTurn = Math.abs(newTurn);
  if(newTurn != 1 && newTurn != 2) return;
  if (timestampInfo.find((val) => val.id == ID) == undefined) {
    startGameTimer(ID, newTurn);
  } else {
    timestampInfo.find((val) => val.id == ID).turn = newTurn;
    // timestampInfo.find((val) => val.id == ID)[`timestampt${originalTurn}`]++;
  }
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
 * @param {number[]} bosses the list of bosses present currently
 * @param {boolean} long if the team has chosen a long boss or not
 * @param {number} bossId the id of the boss
 * @param {boolean} longBoss if the boss is a long boss or not
 * @returns true if the character is found, false if not
 */
const checkExists = (bosses, long, bossId, longBoss) => {
  if(long && longBoss){
    return true;
  }
  if(bosses.includes(bossId)){
    return true;
  }
  return false;
}
/**
 * Checks if the target character (information in the value section) has been banned or picked in the current game.
 * @param {number[]} characters the list of characters currently in the match across extra bans, picks, and bans
 * @param {number} id the id of the character to be checked
 * @returns true if the character is found, false if not
 */
const checkCharacterExists = (characters, id) => {
  if (characters.includes(id)) {
    return true;
  } else {
    return false;
  }
}

server.listen(PORT, host, () => console.log(`connected on host ${host} and port ${PORT}!`));   