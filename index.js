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
const boss = require("./models/bossModel.js")

try{
    wss.on('connection', function connection(ws) {
        console.log("new client");
        ws.on('message', async function incoming(message){
            // could send JSON data and sort it
            const jsonStr = JSON.parse(message);
            if(typeof jsonStr.type == "undefined"){
                throw new Error("Please enter a request type.")
            }
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
                default:
                    throw new Error("Please enter a valid type.")
                // add a few extra options

            }
            // ws.send("message obtained: " + message); 
            wss.clients.forEach(function each(client) { // send data back to connected clients
                if(client.readyState === WebSocket.OPEN){
                  // client !== ws &&
                  client.send(result); 
                }
            })
        });
        ws.on('error', err => {
            let errVal = development == "development" ? err.toString() : "An error occurred"
            ws.send(JSON.stringify({
                message: "Failure",
                error: errVal
            }))
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
      connected: [0,0,0],
      timest1: [0.0, 0.0, 0.0, 0.0, 0.0],
      timest2: [0.0, 0.0, 0.0, 0.0, 0.0],
      phase: "Waiting", 
    };
    // creates a game with the default settings
    const res = await game.create(defaultSettings)
    return JSON.stringify({
        message: "Success",
        type: "create",
        game: res
    });

}
const getGame = async(data) => {
    const res = await game.findById(data).lean();
    if(res == null){
        let errVal =
          development == "development" ? "Game not found" : "An error occurred";
        return JSON.stringify({
          message: "Failure",
          error: errVal,
        });
    }
    else{
        return JSON.stringify({
          message: "Success",
          type: "get",
          game: res,
        });
    }
}
const addItems = async (info) => {
    // add information
    // change bosses, character picks
    try{
        const gameResult = await game.findById(info.id);
        switch (info.changed) {
            case "boss": {
                let findBoss = await boss.findById(info.data.boss) // id of boss
                let newBosses = [...gameResult.bosses, findBoss];
                // verify boss count
                if (
                  findBoss == null ||
                  !checkAmounts(newBosses, gameResult.division, "boss") ||
                  (await checkExists(info.id, "bosses", findBoss))
                ) {
                  //
                  throw new Error(
                    "Please do not enter more than the maximum number of bosses."
                  );
                }
                // add new boss, save. and return a message
                gameResult.bosses = newBosses;
                gameResult.save();
                let newTeam = 0; // switch teams
                switch (info.data.team) {
                  case 1:
                    newTeam = 2;
                    break;
                  case 2:
                    newTeam = 1;
                    break;
                  default:
                    throw new Error("Enter a valid team (1 or 2)");
                }
                return JSON.stringify({
                    message: "Success",
                    type: "boss",
                    boss: info.data.boss,
                    nextTeam: newTeam
                });
            }
            
            case "ban": {
                // get character by index from character model and add it to the bans
                const charPick = await character.findById(info.data.character);
                let newBans = [...gameResult.bans, charPick];
                if(charPick == null || !checkAmounts(newBans, gameResult.division, "ban") || await checkExists(info.id, "bans", charPick)){
                   throw new Error("Please enter a valid ban or number of bans.");
                }
                // add new bans, save, return message
                gameResult.bans = newBans;
                gameResult.save();
                let newTeam = 0;
                switch(info.data.team){
                  case 1: 
                    newTeam = 2;
                    break;
                  case 2:
                    newTeam = 1;
                    break;
                  default:
                    throw new Error("Enter a valid team (1 or 2)")
                }
                return JSON.stringify({
                  message: "Success",
                  type: "ban",
                  ban: info.data.character,
                  nextTeam: newTeam,
                });
            }
                
            case "pick": {
                // get character by index from character model and add it to the picks
                const charPick = await character.findById(info.data.character);
                if (charPick == null) {
                  throw new Error(
                    "Please enter a valid character (use the character syntax)."
                  );
                }
                if (
                  (await checkExists(info.id, "pickst"+info.data.team, charPick))
                ) {
                  throw new Error("Please enter a valid pick for a team.");
                }
                // add picks accordingly based on team
                const swapt1 = [0,2,3,5];
                const swapt2 = [1,2,4,5];
                // find first empty pick
                let ind = -1;
                let nextTeam = 0;
                if(info.data.team == 2){
                  for (let i = 0; i < gameResult.pickst2.length; i++) {
                    if (gameResult.pickst2[i]._id == -1) {
                      ind = i;
                      gameResult.pickst2[i] = charPick;
                      break;
                    }
                  }
                  swapt2.forEach((val) => {
                    if (ind == val) { // found a boundary for team 2 - now it is team 1's turn to pick
                      nextTeam = 1;
                    }
                  });
                  if (nextTeam == 0) { // not a boundary - team 2 go again
                    nextTeam = 2;
                  }
                }
                else{
                  for (let i = 0; i < gameResult.pickst1.length; i++) {
                    if (gameResult.pickst1[i]._id == -1) {
                      ind = i;
                      gameResult.pickst1[i] = charPick;
                      break;
                    }
                  }
                  swapt1.forEach(val => {
                    if(ind == val){
                      nextTeam = 2;
                    }
                  })
                  if(nextTeam == 0){nextTeam = 1;}
                }
                gameResult.save();
                // find the first index at which 
                return JSON.stringify({
                    message: "Success",
                    type: "pick",
                    team: info.data.team,
                    pick: info.data.character,
                    nextTeam: nextTeam
                });
            }
            default:
                throw new Error("Please choose to update a ban, pick, or boss");
        }
    }
    catch(err){
        console.log(err);
        let errVal =  (development == "development") ? err.toString() : "An error occurred";
        return JSON.stringify({
          message: "Failure",
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
        throw new Error("Please enter a valid array size");
    }
    // verify the team number and boss number are valid
    // find game and get times of both teams
    const gameResult = await game.findById(info.id);
    let currentTimes = [gameResult.timest1, gameResult.timest2];
    
    // change the time
    currentTimes[timeInfo[0] - 1][timeInfo[1]] = timeInfo[2];
    // save
    gameResult.save();
    return JSON.stringify({
      message: "Success",
      type: "time",
      time: info.data,
    });
  }
  catch(err){
    console.log(err);
    let errVal =
      development == "development" ? err.toString() : "An error occurred";
    return JSON.stringify({
      message: "Failure",
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
            throw new Error("Please enter a valid phase.")
        }
        await game.findByIdAndUpdate(ID, {result: ""+phase}).lean(); // lean since info not needed
        return JSON.stringify({
            message: "Success",
            type: "phase",
            newPhase: phase,
        });
    }
    catch(err){
        console.log(err);
        let errVal =
          development == "development" ? err.toString() : "An error occurred";
        return JSON.stringify({
          message: "Failure",
          error: errVal,
        });
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
// check if [value] exists for [item] in the game with ID [ID]
// this ensures no dupes of characters or items, for picks only used in draft

const checkExists = async (ID, item, value) => {
    // query the game for the corresponding item
    let targetGame = await game.findById(ID);
    let check = targetGame.get(item);
    // convert to strings and see if one includes the other
    check = JSON.stringify(check);
    let valueString = JSON.stringify(value);
    if(check.includes(valueString)){
        return true;
    }
    return false;
}

server.listen(PORT, () => console.log("connected!"));   