const express = require('express');
require("dotenv").config();
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({server: server})
// app.get('/', (req, res) => res.send('hello world'));
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT;
const development = process.env.NODE_ENV;
const mongoose = require("mongoose");
const game = require("./models/gameModel.js");
const character = require("./models/characterModel.js")
const boss = require("./models/bossModel.js");

try{
    wss.on('connection', function connection(ws) {
        console.log("new client");
        ws.on('message', async function incoming(message){
            // could send JSON data and sort it
            const jsonStr = JSON.parse(message);
            // console.log(jsonStr);
            // calling options: 
            let result = ""; // should be a JSON string
            switch(jsonStr.type){
                case "create":{ 
                    result = await createGame(jsonStr.id);
                    break;
                }
                case "get":
                    result = await getGame(jsonStr.id);
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
                    result = await findTurn(jsonStr.id);
                    break; 
                case "find":
                    result = await getInformation(jsonStr.query);
                    break; 
                case "status":
                    result = await updateStatus(jsonStr);
                    break;
                case "team":
                    result = await updateTeam(jsonStr);
                    break;
                default:
                    result = JSON.stringify({message: "Failure", errType: "Nonexistent", error: "Please enter a valid selection."});
                    break;
                // add a few extra options
            }
            // ws.send("message obtained: " + message); 
            // console.log("-----------------")
            // console.log(result);
            let resCopy = JSON.parse(result);
            if(resCopy.message == "Failure" || resCopy.type == "query" || resCopy.type == "turn"){
              console.log("hi")
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
    timest1: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    timest2: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    phase: "Waiting",
    penaltyt1: {},
    penaltyt2: {},
    deatht1: {},
    deatht2: {}
  };
  
  Object.assign(
    defaultSettings.penaltyt1,
    Array(7).fill(Array(6).fill(false))
  ); // 6 is arbitrary (number of penalties), 3 is number of players, 7 is default number of bosses
  Object.assign(defaultSettings.penaltyt2, Array(7).fill(Array(6).fill(false)));
  Object.assign(defaultSettings.deatht1, Array(7).fill(Array(3).fill(false)));
  Object.assign(defaultSettings.deatht2, Array(7).fill(Array(3).fill(false))); 
  // creates a game with the default settings
  const res = await game.create(defaultSettings)
  return JSON.stringify({
      message: "Success",
      type: "create",
      game: res,
      id: res._id
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
          id: res._id
        });
    }
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
        }
        // console.log(gameResult);
        switch (info.changed) {
            case "boss": {
              let findBoss = await boss.findById(info.data.boss); // id of boss
              let last = false; // verify boss count
              if (
                findBoss == null ||
                (await checkExists(info.id, info.data.boss))
              ) {
                //
                return JSON.stringify({
                  message: "Failure",
                  errType: "Invalid",
                  error: "Please provide a valid boss id to select.",
                });
              }
              for (let i = 0; i < gameResult.bosses.length; i++) {
                if (gameResult.bosses[i]._id == -1) {
                  findBoss.chosen = true; // will not update to server unless i run save
                  gameResult.bosses[i] = findBoss;
                  if (i == gameResult.bosses.length - 1) {
                    last = true;
                  }
                  break;
                }
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
                  return JSON.stringify({
                    message: "Failure",
                    errType: "Nonexistent",
                    error: "Please provide a valid team to select.",
                  });
              }
              if (last) {
                newTeam = -1;
              }
              // add new boss, save. and return a message
              newTeam < 0 ? gameResult.turn = -1 * newTeam : gameResult.turn = newTeam;
              await gameResult.save();
              return JSON.stringify({
                message: "Success",
                type: "boss",
                game: gameResult,
                boss: info.data.boss,
                id: info.id,
                nextTeam: newTeam,
              });
            }
            
            case "ban": {
              // get character by index from character model and add it to the bans
              const charPick = await character.findById(info.data.character);
              let status = await checkCharacterExists(info.id, charPick);
              if (charPick == null || status){
                return JSON.stringify({
                  message: "Failure",
                  errType: "Invalid",
                  error: "Please provide a valid character id to ban."
                })
              }
              let last = 0;
              for(let i = 0; i < gameResult.bans.length; i++){
                if(gameResult.bans[i]._id == -1){
                  charPick.chosen = true;
                  gameResult.bans[i] = charPick;
                  if (i == gameResult.bans.length - 1) { // swaps to picks on 4th and 6th ban - this is 6th ban
                    last = 1;
                  }
                  else if(i == gameResult.bans.length - 3){ // 4th ban
                    last = 2;
                  }
                  break;
                }
              }
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
                  break;
                case -2:
                  gameResult.turn = 1;
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
                game: gameResult,
                id: info.id,
                nextTeam: newTeam,
              });
            }
                
            case "pick": {
            // get character by index from character model and add it to the picks
            const charPick = await character.findById(info.data.character);
            if (charPick == null || await checkCharacterExists(info.id, charPick)) {
              return JSON.stringify({
                message: "Failure",
                errType: "Invalid",
                error: "Please provide a valid character id to pick.",
              });
            }
            // add picks accordingly based on team
            const swapt1 = [0,2,4,5];
            const swapt2 = [1,2,3,5];
            // find first empty pick
            let ind = -1;
            let newTeam = 0;
            if(info.data.team == 2){
              for (let i = 0; i < gameResult.pickst2.length; i++) {
                if (gameResult.pickst2[i]._id == -1) {
                  ind = i;
                  charPick.chosen = true;
                  gameResult.pickst2[i] = charPick;
                  break;
                }
              }
              for(let i = 0; i < swapt2.length; i++) {
                if (ind == swapt2[i]) { // found a boundary for team 2 - now it is team 1's turn to pick
                  if(i == 1){
                    // bandage solution - third pick goes back to one more set of bans, where team 2 starts
                    newTeam = -2;
                  }
                  else{
                    newTeam = 1;
                  }
                  break;
                }
              };
              if (newTeam == 0) { // not a boundary - team 2 go again
                newTeam = 2;
              }
            }
            else{
              for (let i = 0; i < gameResult.pickst1.length; i++) {
                if (gameResult.pickst1[i]._id == -1) {
                  ind = i;
                  charPick.chosen = true;
                  gameResult.pickst1[i] = charPick;
                  break;
                }
              }
              swapt1.forEach(val => {
                if(ind == val){
                  newTeam = 2;
                }
              })
              if(newTeam == 0){newTeam = 1;}
            }
            if(ind == swapt1[swapt1.length - 1] && info.data.team == 1){ // first team has very last pick
              newTeam = -1;
            }
            newTeam < 0 ? gameResult.turn = -1 * newTeam : gameResult.turn = 1 * newTeam;
            await gameResult.save();
            // find the first index at which 
            return JSON.stringify({
              message: "Success",
              type: "pick",
              pick: info.data.character,
              team: info.data.team,
              game: gameResult,
              id: info.id,
              nextTeam: newTeam
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
      const keywords = ["setup","progress","finish","1","2"]
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
const findTurn = async(id) => {
  const foundGame = await game.findById(id).lean();
  return JSON.stringify({
    message: "Success",
    type: "turn",
    turn: foundGame.turn,
    id: id
  });
}

const getInformation = async(query) => {
  if(query == "boss"){
    // find bosses
    const bosses = await boss.find({}).lean();
    return JSON.stringify({
      message: "Success",
      type: "query",
      boss: true,
      bossList: bosses
    })
  }
  else if(query == "character"){
    const characters = await character.find({}).lean();
    return JSON.stringify({
      message: "Success",
      type: "query",
      character: true,
      characterList: characters,
    });
  }
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
  let picksInfo = [gameInfo.pickst1, gameInfo.pickst2];
  let newPicks = [];
  for(let i = 0; i < gameInfo.pickst1.length; i++){
    newPicks.push(picksInfo[info.team - 1][info.data.order[i]]); // copy data from old array and move to new
  }
  switch (info.team) {
    case 1:
      gameInfo.pickst1 = newPicks;
      gameInfo.team1 = info.data.teamName;
      gameInfo.playerst1 = info.data.playerNames;
      break;
    case 2:
      gameInfo.pickst2 = newPicks;
      gameInfo.team2 = info.data.teamName;
      gameInfo.playerst2 = info.data.playerNames;
      break;
    default:
      return JSON.stringify({
        message: "Failure",
        errType: "Nonexistent",
        error: "Please make sure to select a valid team number!",
      });
  }
  await gameInfo.save();
  return JSON.stringify({
    message: "Success",
    type: "TeamUpdate",
    game: gameInfo,
    team: info.team,
    id: info.id,
    teamName: info.data.teamName,
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
  console.log(gameInfo.penaltyt1[0]);
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
 * @param {Object} value the boss you are checking
 * @returns true if the character is found, false if not
 */
const checkExists = async (ID, value) => {
  if(value == null){
    return true; // not because it exists, but instead because it should throw an error
  }
  // query the game for the corresponding item
  let targetGame = await game.findById(ID);
  let check = targetGame.get("bosses");
  // convert to strings and see if one includes the other
  check = JSON.stringify(check);
  let valueString = JSON.stringify({
    _id: value._id,
    boss: value.boss,
  });
  if(check.includes(valueString)){
    return true;
  }
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
  let total = t1 + t2 + bans;
  let valueString = JSON.stringify({
    _id: value._id,
    name: value.name
  });
  valueString = valueString.substring(0, valueString.length - 1);
  if (total.includes(valueString)) {
    return true;
  } else {
    return false;
  }
}

server.listen(PORT, () => console.log("connected!"));   