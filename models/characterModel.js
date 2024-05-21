const mongoose = require('mongoose');
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
    required: true
  }
});

module.exports = mongoose.model("character", characterSchema);