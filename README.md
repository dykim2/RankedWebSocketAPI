# RankedWebSocketAPI
## Defining a specific syntax for requests
All messages sent to the API must follow the following format:
```json
{   
    id: ID,
    type: "create",
    changed: "boss",
    data: {
        boss: "Maguu Kenki",
        team: 1,
        character: 15
    }
}
```
`id` is the ID of the game you are looking to update. `type` can be one of `create`, `add`, `times`, or `switch`. Choosing another keyword results in an error. This is mandatory.
`changed` comes with `add` requests and must be one of `boss`, `ban`, or `pick`. 

The `data` field holds all of the important data needed for the request. It comes in the form of a JSON object. **Characters are identified by ID, not by name!**

For `switch` requests, data should be as follows:
```json
data: {
    phase: "setup" // can be setup, progress, and finish. Any other option throws an error.
}
```

Some more exanmples of `add` requests:
```json
{
    {
        id: 178,
        type: "add",
        changed: "boss",
        data: {
            boss: "Terrorshroom"
        } // add the "terrorshroom" boss to the boss list
    },
    {
        id: 178,
        type: "add",
        changed: "ban",
        data: {
            character: 34
        } // ban the character with ID 34
    }
}
```