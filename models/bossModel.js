const mongoose = require("mongoose");
const bossSchema = mongoose.Schema({
    _id: Number,
    boss: {
        type: String,
        required: [true, "Please enter a name for this boss"]
    },
    icon: {
        type: String,
        default: "boss icon"
    },
    type: {
        type: String,
        required: [true, "Please enter a boss type."]
    },
    long: { // longer bosses
        type: Boolean,
        default: false
    },
    element: {
        type: String
    },
    chosen: {
        type: Boolean,
        default: false
    }
}) 

module.exports = mongoose.model("boss", bossSchema);