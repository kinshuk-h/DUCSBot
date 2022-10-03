const readline = require("readline");

const { client, makeMessage } = require("./dummy-wwebjs");
const { handleMessage }       = require("./index");

const stream = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});
stream.prompt();
stream.on("line", line => {
    if(line == "exit") stream.close();
    else { handleMessage(client, makeMessage(line)); }
});
stream.on("close", () => { process.exit(0); });