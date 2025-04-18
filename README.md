# RankedWebSocketAPI
## Defining a specific syntax for requests
All messages sent to the API must follow the following format:
```json
{   
    "id": 1,
    "type": "create",
    "changed": "boss",
    "data": {
        "boss": "Maguu Kenki",
        "team": 1,
        "character": 15
    },
    "phase": "progress"
}
```
`id` is the ID of the game you are looking to update (replace 1 with the target game ID). `type` can be one of `create`, `add`, `times`, or `switch`. Choosing another keyword results in an error. This is mandatory.
`changed` comes with `add` requests and must be one of `boss`, `ban`, or `pick`. 

The `data` field holds all of the important data needed for the request. It comes in the form of a JSON object. **Characters are identified by ID, not by name!**

For `switch` requests, data should be as follows:
```json
"data": {
    "phase": "setup" // can be setup, progress, and finish. Any other option throws an error.
}
```
For `times` requests, `data` should be an array of size 3, with a format like follows:
```json
{
    "data": ["<1 or 2 representing which team is chosen>", "<a number from 0 to 6 (or 8 if premier) corresponding to the boss to be updated>", "<the time to add to the boss>"]
}
```
Make sure to remove the brackets and quotation marks when sending requests.

Some more examples of `add` requests:
```json
{
    {
        "id": 178,
        "type": "add",
        "changed": "boss",
        "data": {
            "boss": 19
        } // add the "terrorshroom" boss to the boss list (boss with ID 19)
    },
    {
        "id": 178,
        "type": "add",
        "changed": "ban",
        "data": {
            "character": 34
        } // ban the character with ID 34 (Kamisato Ayaka)
    }
}
```
