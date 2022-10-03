/** @typedef {import('whatsapp-web.js').Chat} Chat */
/** @typedef {import('whatsapp-web.js').Client} Client */
/** @typedef {import('whatsapp-web.js').Contact} Contact */
/** @typedef {import('whatsapp-web.js').Message} Message */
/** @typedef {import('whatsapp-web.js').ContactId} ContactId */
/** @typedef {import('whatsapp-web.js').MessageContent} MessageContent */
/** @typedef {import('whatsapp-web.js').MessageSendOptions} MessageSendOptions */

/**
 * @typedef {Object} ReceiverContact An object describing a receiver contact.
 * @property {boolean} isMe true if the contact refers to the sender's contact or chat itself.
 * @property {ContactId} id identification details of the contact.
 * @property {string} number The contact number of the contact. Contains an extra '+' before the country code.
 */
/** Parses a string of receiver contacts, resolving any direct and indirect
 *  mentions, and returns an array of contact objects for contacts as parsed.
 *
 * @param {string} receiver_string The string of contacts and mentions.
 * @param {Chat} chat The chat in which the message was sent, to help resolve indirect mentions.
 * @param {Contact} from The contact of the sender, to help resolve indirect mentions.
 * @param {ContactId} bot The contact ID details of the client/bot.
 * @param {{ country_code: string }} options Additional options specifying default decisions.
 *
 * @returns {ReceiverContact[]} An array of receivers in a format preferred by whatsapp-web.js
 */
function parseReceivers(receiver_string, chat, from, bot, { country_code = '91' } = {}) {
    const receiver_set = new Set();
    if(country_code.charAt(0) == '+') country_code = country_code.slice(1);
    for(let contact of receiver_string.split(/(?:(?:\s*(?:,\s*)+)|\s+(?=[+@])|(?<=\.us)\s+)/mu)) {
        const start_char = contact.charAt(0);
        if(start_char == '@') {
            contact = contact.toLowerCase();
            if(contact == "@everyone" || contact == "@all") {
                for(let member of (chat.isGroup ? chat.participants : [])) {
                    if(member.id._serialized != bot._serialized)
                        receiver_set.add(from.id._serialized);
                }
            }
            else if(contact == "@admins" || contact == "@admin") {
                for(let member of (chat.isGroup ? chat.participants : [])) {
                    if(member.id._serialized != bot._serialized &&
                       member.isAdmin || member.isSuperAdmin)
                        receiver_set.add(from.id._serialized);
                }
            }
            else if(contact == "@me") { receiver_set.add(from.id._serialized); }
            else { receiver_set.add(contact.slice(1) + '@c.us'); }
        }
        else if(contact.endsWith('.us')) { receiver_set.add(contact); }
        else if(start_char == '+') {
            contact = contact.replaceAll(/[ ()-]/gu, "");
            receiver_set.add(contact.slice(1) + '@c.us');
        }
        else if(contact) {
            contact = contact.replaceAll(/[ ()-]/gu, "");
            receiver_set.add(country_code + contact + '@c.us');
        }
    }
    const receivers = [ ...receiver_set ];
    if(receivers.length == 0) receivers.push(chat.id._serialized);
    return receivers.map(_serialized => {
        const [ user, server ] = _serialized.split('@');
        const isMe = _serialized == chat.id._serialized || _serialized == from.id._serialized;
        return { isMe, number: user, id: { server, user, _serialized } };
    });
}

/** Mapping function to map a string to an absolute contact ID.
 * @type {import("./src/regex").RegexExtractMapFunction} */
function toReceiverId(str, grp) {
    if(grp == 1 && typeof str == "string") {
        const start_char = str.charAt(0);
        if(!str.includes("g.us"))
            str = str.toLowerCase().replaceAll(/[ ()-]/gu, "");

        if     (start_char == '@' || start_char == '+')
            return str.slice(1) + '@c.us';
        else if(str.endsWith('.us'))
            return str;
        else
            return "91" + str + '@c.us';
    }
    else return str;
}

/** Encodes a command in a representation suitable for use as a List Row/Button ID.
 *
 * @param {string} command The command to encode.
 * @param {string} randomstr A string to append to the ID for preserving uniqueness.
 *      By default a randomly generated string is used.
 */
function encodeAsId(command, randomstr = undefined) {
    if(!randomstr) randomstr = Math.random().toString(36).slice(-7);
    return Buffer.from(command).toString("base64") + ":" + randomstr;
}

/** Decodes an encoded ID end returns the underlying command.
 *
 * @param {string} encodedId The encoded command as returned by {@link encodeAsId}.
 * @returns {string} The command if present, otherwise the ID itself.
 */
function decodeFromId(encodedId) {
    const [ encodedCommand, randomstr = "" ] = encodedId.split(":", 2);
    if(randomstr.length == 0) return encodedCommand;
    else return Buffer.from(encodedCommand, "base64").toString("utf-8");
}

/** Returns status about a contact being a bot admin or a host.
 *
 * @param {string} user_id The user id of the contact to check.
 */
function checkPrivilegeStatus(user_id) {
    return {
        is_bot_admin: user_id == "918468086504@c.us"
            || user_id == "917056284944@c.us"
            || user_id == "911270016969@c.us",
        is_host: user_id == "918468086504@c.us",
    };
}

/** Represents a message deleter which caches messages sent
 *  for deletion and then deletes them all at once.
 */
class MessageDeleter {
    /**
     * @typedef {Object} MessageData Represents basic details about a message.
     * @property {string} id The serialized ID of the message.
     * @property {number} timestamp The timestamp of message creation.
     */
    /**
     * @typedef {Object} Options Options to control caching and auto-deletion of messages.
     * @property {number} [messageDelay=180] Minimum delay in seconds between the timestamps of the last
     *      cached message and the current message to delete to initiate deletion of the queue's messages.
     * @property {number} [maxQueueLength=15] Minimum length of the message caching queue
     *      to initiate deletion of messages.
     * @property {boolean} [performAutoDeletion=true] If true, initiates a timeout to perform
     *      auto-deletion of the queue's messages after a specified time interval.
     * @property {number} [collectionInterval=600] Interval duration in seconds in which the
     *      auto-deletion of the queue's messages is performed.
    */

    /** @type {{ [id: string]: MessageData[] }} Queue of messages to delete in specific chats. */
    deleteQueues = {};

    /** @type {any} ID of the current timeout launched for auto-deletion of messages. */
    deleterId = null;

    /** @type {Options} Options to control caching and auto-deletion of messages. */
    options = {
        messageDelay: 180,
        maxQueueLength: 15,
        performAutoDeletion: true,
        collectionInterval: 600,
    };

    /** @type {number} Current time multiplier for the time interval of the auto-deleter. */
    _multiplier = 1;

    /** Creates a new MessageDeleter instance.
     *
     * @param {Client} client A whatsapp-web.js client instance representing the current session.
     * @param {Options} options Options to control caching and auto-deletion of messages.
     */
    constructor(client, options = undefined) {
        this.client = client;
        this.className = this.constructor.name;

        Object.assign(this.options, options ?? {});

        if(this.options.performAutoDeletion)
            this.startAutoDeleter();
    }

    /** Performs the deletion of messages in the client context using WhatsApp's exposed internal methods.
     *
     * @param {MessageData[]} messages The list of message data referring to messages to delete.
     */
    static sendDeleteMsgs(messages) {
        /* global window */
        let msgObjects = [];
        for(let msg of messages) {
            msg = window.Store.Msg.get(msg.id);
            if(msg) msgObjects.push(msg);
        }
        if(msgObjects.length == 0) return null;
        return window.Store.Cmd.sendDeleteMsgs(msgObjects[0].chat, msgObjects, true);
    }
    /** Deletes previously cached messages and clears the deletion queue.
     *
     * @param {MessageData[]} deleteQueueReference The reference to the deletion queue for a specific chat.
     */
    async batchDelete(deleteQueueReference) {
        await this.client.pupPage.evaluate(MessageDeleter.sendDeleteMsgs, deleteQueueReference);
        deleteQueueReference.length = 0;
    }

    /** Checks if the delete queue satisfies the criteria to be considered for collection.
     *
     * @param {MessageData[]} deleteQueueReference The reference to the deletion queue for a specific chat.
     * @param {number} newMessageTimestamp The timestamp of the message being currently deleted.
     * @returns {boolean} True if the queue's messages should be deleted.
     */
    canClearDeleteQueue(deleteQueueReference, newMessageTimestamp) {
        if(deleteQueueReference.length > this.options.maxQueueLength) return true;
        const lastMsg = deleteQueueReference.length > 0 ? deleteQueueReference[deleteQueueReference.length - 1] : null;
        if(lastMsg && (newMessageTimestamp - lastMsg.timestamp) > this.options.messageDelay) return true;
        return false;
    }

    /** Deletes a message, for only the current client instance.
     *
     * This function does not immediately delete the message, but records the message data for deletion in near-future.
     * The message is then deleted along with others after certain criteria is met, or whenever the auto-deleter is run.
     *
     * @param {Message} message The whatsapp-web.js Message instance to delete.
     */
    async deleteForMe(message) {
        const chatId = message.fromMe ? message.to : message.from;
        if(!(chatId in this.deleteQueues)) this.deleteQueues[chatId] = [];
        else {
            const currentDeleteQueue = this.deleteQueues[chatId];
            if(this.canClearDeleteQueue(currentDeleteQueue, message.timestamp)) {
                await this.batchDelete(currentDeleteQueue);
            }
        }
        const length = this.deleteQueues[chatId].push({
            id: message.id._serialized, timestamp: message.timestamp
        });
        console.log(
            "> %s: Queued %s message at #%d",
            this.className, message.type, length
        );
    }

    /** Executes pending deletion operations by deleting message batches.
     *
     * @returns {number} The aggregated count of messages deleted across pending batches.
     */
    async execute() {
        let aggregateQueueLength = 0;
        for(let chat in this.deleteQueues) {
            const deleteQueue = this.deleteQueues[chat];
            aggregateQueueLength += deleteQueue.length;
            if(deleteQueue.length > 0) {
                const oldLength = deleteQueue.length;
                await this.batchDelete(deleteQueue);
                if(oldLength < (this.options.maxQueueLength >> 2)) {
                    if(chat.endsWith("@c.us")) {
                        setTimeout(async () => {
                            const chat_instance = await this.client.getChatById(chat);
                            const messages = await chat_instance.fetchMessages({ limit: 1 });
                            if(!messages?.length) await chat_instance.delete();
                        }, 1000);
                    }
                    delete this.deleteQueues[chat];
                }
            }
        }
        return aggregateQueueLength;
    }

    /** Attempts to start the scheduled run of the auto-deleter. */
    startAutoDeleter() {
        this.deleterId = setTimeout(async function callback(instance) {
            console.log("> %s: Executing auto-deleter ...", instance.className);

            const aggregateQueueLength = await instance.execute();
            if(aggregateQueueLength == 0) console.log("> %s: Nothing to delete.", instance.className);
            else console.log("> %s: Successfully deleted %d messages.", instance.className, aggregateQueueLength);

            if(instance._multiplier > 1 && aggregateQueueLength > (instance.options.maxQueueLength << 1))
                instance._multiplier -= 2;
            else if(instance._multiplier > 1 && aggregateQueueLength > instance.options.maxQueueLength)
                instance._multiplier -= 1;
            else if(instance._multiplier < 2 && aggregateQueueLength < (instance.options.maxQueueLength >> 1))
                instance._multiplier += 1;
            else if(instance._multiplier < 6 && aggregateQueueLength < (instance.options.maxQueueLength >> 2))
                instance._multiplier += 2;

            const nextTimeout = instance._multiplier * instance.options.collectionInterval;
            console.log("> %s: Next auto-deletion after %d s.\n", instance.className, nextTimeout);
            instance.deleterId = setTimeout(callback, nextTimeout * 1000, instance);
        }, this.options.collectionInterval * 1000, this);
    }
    /** Attempts to cancel the scheduled run of the auto-deleter. */
    stopAutoDeleter() {
        if(this.deleterId !== null)
            clearTimeout(this.deleterId);
    }
}

/** Encodes all characters of a URL and makes it compatible for sending on WhatsApp.
 * Any trailing characters like = skipped by WhatsApp are avoided.
 *
 * @param {string} url A possibly partially unencoded URL.
 * @param {string} [bot_ref] A unique token to disambiguate encoded URLs in the wild.
 */
function encodeURL(url, bot_ref = "") {
    const urlobj = new URL(url);
    if(urlobj.href.endsWith('=')) {
        bot_ref = bot_ref || Math.random().toString(16).slice(-9);
        urlobj.searchParams.append('bot', bot_ref);
    }
    return urlobj;
}

module.exports = exports = {
    parseReceivers,
    toReceiverId,
    encodeAsId,
    decodeFromId,
    checkPrivilegeStatus,
    MessageDeleter,
    encodeURL,
};