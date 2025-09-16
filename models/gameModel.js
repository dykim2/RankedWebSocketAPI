const mongoose = require("mongoose");
// start replacing bosses in terms of how they are saved
// save the number instead
const gameSchema = mongoose.Schema(
  {
    _id: Number,
    bans: {
      type: [Number],
      default: [],
    },
    totalBans: {
      type: Number,
      default: 8,
    },
    bossBans: {
      type: [Number],
      default: [], // would be up to 2 bans - 1 per team
    },
    bosses: {
      type: [Number],
      default: [],
    },
    connected: {
      type: [Number],
      default: [0, 0, 0], // captain 1, captain 2, ref 1, ref 2 connected?
    },
    division: {
      type: String,
      default: "Standard",
    },
    extrabans: {
      type: [Number], // i think honestly replace schemas with numbers - save 
      default: [], // extra bans go in order, depending on the number of extra bans a team gets, max 3
    },
    extrabanst1: {
      type: Number,
      default: 0, // number of extra bans team 1 gets
    },
    extrabanst2: {
      type: Number,
      default: 0,
    },
    fearless: {
      type: Boolean,
      default: false,
    },
    fearlessBosses: {
      type: [Number], // number?? oh wait
      default: [],
    },
    hovered: {
      type: [Number],
      default: [-1, -1], // whatever pick is currently being hovered; an attempt to make the website backend decide on the pick when time runs out
      // needs to be unique per team, otherwise one team's hover will mess with the other team's hover
    },
    log: {
      type: String,
      default: "",
    },
    longBoss: {
      type: [Boolean],
      default: [false, false],
    },
    pickst1: {
      type: [Number],
      default: [],
    },
    pickst2: {
      type: [Number],
      default: [],
    },
    playerst1: {
      type: [String],
      default: ["p11", "p12", "p13"],
    },
    playerst2: {
      type: [String],
      default: ["p21", "p22", "p23"],
    },
    processing: {
      type: Boolean,
      default: false,
    },
    result: {
      type: String,
      default: "waiting", // can be "waiting, setup", "progress", and "finish", or a winning team (1 or 2, in format of a string)
    },
    team1: {
      type: String,
      default: "team 1",
    },
    team2: {
      type: String,
      default: "team 2",
    },
    turn: {
      type: Number,
      default: 1, // the turn number
    },
  },
  {
    timestamps: true,
  }
);

const game = mongoose.model("Game", gameSchema);
module.exports = game;
 