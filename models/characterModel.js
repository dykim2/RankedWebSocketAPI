const mongoose = require("mongoose");
const characterSchema = mongoose.Schema({
  _id: Number,
  name: {
    type: String,
    required: [true, "Please enter the character name"],
  },
  image: {
    type: String,
    required: true,
  },
  element: {
    type: String,
    required: true,
  },
  rarity: {
    type: Number,
    default: 4,
  },
  weapon: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
  },
  chosen: {
    // whether the character was picked or banned during this game
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("character", characterSchema);
