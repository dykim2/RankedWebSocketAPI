const mongoose = require('mongoose');
const characterSchema = require('./characterModel').schema;
const gameSchema = mongoose.Schema(
  {
    _id: Number,
    playerst1: {
      type: [String]
    },
    playerst2: {
      type: [String]
    },
    division: {
      type: String,
      default: "Open",
      required: false,
    },
    bans: {
      type: [characterSchema]
    },
    bosses: {
      type: [String],
      required: true,
    },
    result: {
      type: String,
      default: "Waiting",
    },
    team1: {
      type: String,
      default: "Team 1",
    },
    team2: {
      type: String,
      default: "Team 2",
    },
    timest1: {
      type: [Number],
      default: [0, 0, 0, 0, 0, 0, 0]
    },
    timest2: {
      type: [Number],
      default: [0, 0, 0, 0, 0, 0, 0]
    },
    pickst1: {
      type: [characterSchema]
    },
    pickst2: {
      type: [characterSchema]
    },
    phase: {
      type: String,
      default: "Setup" // can be "Setup", "In Progress", and "Finished". 
    }
  },
  {
    timestamps: true,
  }
);

const game = mongoose.model("Game", gameSchema)
module.exports = game;