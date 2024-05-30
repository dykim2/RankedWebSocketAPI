const mongoose = require('mongoose');
const characterSchema = require('./characterModel').schema;
const bossSchema = require('./bossModel').schema;
const gameSchema = mongoose.Schema(
  {
    _id: Number,
    playerst1: {
      type: [String],
    },
    playerst2: {
      type: [String],
    },
    division: {
      type: String,
      default: "Advanced",
    },
    bans: {
      type: [characterSchema],
      default: [],
    },
    bosses: {
      type: [bossSchema],
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
      default: "Team 1",
    },
    team2: {
      type: String,
      default: "Team 2",
    },
    longBoss: {
      type: [Boolean],
      default: [false, false],
    },
    timest1: {
      type: [Number],
      default: [0, 0, 0, 0, 0, 0, 0],
    },
    timest2: {
      type: [Number],
      default: [0, 0, 0, 0, 0, 0, 0],
    },
    pickst1: {
      type: [characterSchema],
      default: [],
    },
    pickst2: {
      type: [characterSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const game = mongoose.model("Game", gameSchema)
module.exports = game;