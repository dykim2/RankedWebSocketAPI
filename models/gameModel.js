const mongoose = require("mongoose");
const characterSchema = require("./characterModel").schema;
const bossSchema = require("./bossModel").schema;
const gameSchema = mongoose.Schema(
  {
    _id: Number,
    playerst1: {
      type: [String],
      default: ["p11", "p12", "p13"],
    },
    playerst2: {
      type: [String],
      default: ["p21", "p22", "p23"],
    },
    division: {
      type: String,
      default: "Standard",
    },
    bans: {
      type: [characterSchema],
      default: [],
    },
    extrabans: {
      type: [characterSchema],
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
    bosses: {
      type: [bossSchema],
      default: [],
    },
    draft: {
      type: Boolean,
      default: true, // draft or blind game
    },
    fearless: {
      type: Boolean,
      default: false,
    },
    fearlessBosses: {
      type: [Number],
      default: [],
    },
    result: {
      type: String,
      default: "waiting", // can be "waiting, setup", "progress", and "finish", or a winning team (1 or 2, in format of a string)
    },
    connected: {
      type: [Number],
      default: [0, 0, 0], // captain 1, captain 2, ref 1, ref 2 connected?
    },
    team1: {
      type: String,
      default: "team 1",
    },
    team2: {
      type: String,
      default: "team 2",
    },
    penaltyt1: {
      type: Object,
      required: true,
    },
    penaltyt2: {
      type: Object,
      required: true,
    },
    deatht1: {
      type: Object,
      required: true,
    },
    deatht2: {
      type: Object,
      required: true,
    },
    turn: {
      type: Number,
      default: 1, // the turn number
    },
    longBoss: {
      type: [Boolean],
      default: [false, false],
    },
    timest1: {
      type: [Number],
      default: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    },
    timest2: {
      type: [Number],
      default: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    },
    pickst1: {
      type: [characterSchema],
      default: [],
    },
    pickst2: {
      type: [characterSchema],
      default: [],
    },
    pickorder: {
      type: [characterSchema],
      default: [],
    },
    supportBans: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const game = mongoose.model("Game", gameSchema);
module.exports = game;
