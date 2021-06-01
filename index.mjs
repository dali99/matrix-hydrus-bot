import {
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinUpgradedRoomsMixin,
    RichRepliesPreprocessor
} from "matrix-bot-sdk";


import { existsSync } from "fs";
import axios from "axios";

const config = (existsSync("./config.json")) ? require("./config.json") : {};

const homeserverUrl = (config.homeserver || process.env.BONES_HOMESERVER || process.env.MATRIXDEV_HOMESERVER);
const accessToken = (config.token || process.env.BONES_TOKEN || process.env.MATRIXDEV_TOKEN);

const hydrusURI = (config.hydrus_api || process.env.HYDRUS_URI);
const hydrusToken = (config.hydrus_token || process.env.HYDRUS_TOKEN);

const fake_hs = (config.fake_hs || process.env.FAKE_HS);
const prefix = (config.prefix || process.env.PREFIX || "");

// We'll want to make sure the bot doesn't have to do an initial sync every
// time it restarts, so we need to prepare a storage provider. Here we use
// a simple JSON database.
const storage = new SimpleFsStorageProvider("hydrus-bot.json");

// Now we can create the client and set it up to automatically join rooms.
const client = new MatrixClient(homeserverUrl, accessToken, storage);
AutojoinUpgradedRoomsMixin.setupOnClient(client);
client.addPreprocessor(new RichRepliesPreprocessor(false));

// We also want to make sure we can receive events - this is where we will
// handle our command.
client.on("room.message", handleCommand);
client.on("room.invite", (roomId, inviteEvent) => {
    console.log(inviteEvent);
    if (inviteEvent.sender !== "@dandellion:dodsorf.as") return;
    return client.joinRoom(roomId);
});

// Now that the client is all set up and the event handler is registered, start the
// client up. This will start it syncing.
client.start().then(() => console.log("Client started!"));

// This is our event handler for dealing with the `!hello` command.
async function handleCommand(roomId, event) {
    // Don't handle events that don't have contents (they were probably redacted)
    if (!event["content"]) return;

    // Don't handle non-text events
    if (event["content"]["msgtype"] !== "m.text") return;

    // We never send `m.text` messages so this isn't required, however this is
    // how you would filter out events sent by the bot itself.
    if (event["sender"] === await client.getUserId()) return;
    // Make sure that the event looks like a command we're expecting

    const text = event["content"]["body"];
    if (!text) return;

    console.log(text);

    var tags = [];

    var re = /`([a-z1-9:. æøå]*)`/g;
    do {
        var m = re.exec(text);
        if (m) {
            tags.push(m[1]);
        }
    } while (m);

    if (tags == false) return;

    var encoded_tags = encodeURI(JSON.stringify(tags));

    var file_ids = (await axios.get(hydrusURI + "/get_files/search_files?system_inbox=true&tags=" + encoded_tags, {headers: {'Hydrus-Client-API-Access-Key': hydrusToken}})).data.file_ids;

    if (file_ids == false) return;

    console.log(file_ids);

    var random_id = [file_ids[Math.floor(Math.random() * file_ids.length)]];

    var encoded_id = encodeURI(JSON.stringify(random_id));

    var metadata = (await axios.get(hydrusURI + "/get_files/file_metadata?&file_ids=" + encoded_id, {headers: {'Hydrus-Client-API-Access-Key': hydrusToken}})).data.metadata[0];
    console.log(metadata);

    var hash = metadata.hash;
    var width = metadata.width;
    var height = metadata.height;
    var mime = metadata.mime;
    var ext = metadata.ext;
    var size = metadata.size;

    var mxc = "mxc://" + fake_hs + "/" + prefix + hash;

    var event = {
        "body": hash + ext,
        "info": {
            "h": height,
            "w": width,
            "mimetype": mime,
            "size": size,
        },
        "msgtype": "m.image",
        "url": mxc
    };

    client.sendMessage(roomId, event);
}
