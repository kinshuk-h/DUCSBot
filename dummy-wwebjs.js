const { MessageMedia, List } = require("whatsapp-web.js");

function join(...regexes) {
    const { source, flags } = regexes.reduce(({ source, flags }, regex) => {
        if(typeof regex == "string") regex = { source: regex, flags: '' };
        for(let flag of regex.flags) if(!flags.includes(flag)) flags += flag;
        return { source: source + regex.source, flags };
    }, { source: '', flags: '' });
    return new RegExp(source, flags);
}

const regex_segments = {
    url: {
        scheme: /(?:(?<scheme>[a-z]+):)?/gmiu,
        relative_specifier: /(?:\/\/)?/miu,
        basic_authentication: /(?:(?<username>[\w.~!$%&'()*,;=+^/-]+)?:(?<password>[\w.~!$%&'()*,;=+^/-]+)?@)?/miu,
        hostname: /(?<hostname>(?:\[[\da-fA-F:]+\])|(?:\d{2}[\d.]+)|(?:(?=.{4,253}\.?)(?:(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,63}\.?))/miu,
        port: /(?::(?<port>\d*))?/u,
        path: /(?<path>(?:\/[^\s/?]{0,1024})+)?/iu,
        query: /(?<query>\?[\w.:@%~!$&'()*+,^;=?[\]{}\\|/-]*)?/miu,
        fragment: /(?<fragment>#[\w.:@%~!$&'()*+,^;=?[\]{}\\|/-]*)?/miu
    },
}
const url_regex = join(
    regex_segments.url.scheme,
    regex_segments.url.relative_specifier,
    regex_segments.url.basic_authentication,
    regex_segments.url.hostname,
    regex_segments.url.port,
    regex_segments.url.path,
    regex_segments.url.query,
    regex_segments.url.fragment
)

/** @type {import('whatsapp-web.js').Contact} */
const from = {
    id: {
        server: 'c.us',
        user: '911270016969',
        _serialized: "911270016969@c.us"
    },
    shortName: "Local",
    name: "Localhost",
    number: "911270016969",
    pushname: "127.0.0.1"
};

/** @type {import('whatsapp-web.js').Client} */
const client = {
    async sendMessage(from, message, { quotedMessageId, caption } = {}) {
        if(from == "916969420420@c.us") throw new Error("Sorry, but noice.");
        if(quotedMessageId) console.log("| reply to", quotedMessageId);
        if(message instanceof MessageMedia)
            message.data = `${message.data.slice(0, 10)}... (${message.data.length} characters)`;
        console.log(from, ":", message);
        if(message instanceof List)
            for(const section of message.sections)
                console.log(from, ":", section.rows);
        if(message instanceof MessageMedia)
            console.log(from, ":", caption ?? "");
        return makeMessage(message);
    },
    sendSeen: async () => {},
    info: {
        pushname: "localhost",
        wid: from.id
    },
    getFormattedNumber(contact_id) {
        return `+${contact_id.split("@")[0]}`;
    }
};

/** Creates a template message object from a given body.
 *
 * @param {import('whatsapp-web.js').MessageContent} body The content to add in the message.
 * @returns {import('whatsapp-web.js').Message} The message object.
 */
const makeMessage = body => {
    const msg_id = Math.random().toString(36).substr(2)
                 + Math.random().toString(36).substr(2);
    return {
        client,
        type: 'chat',
        author: undefined,
        from: "911270016969@c.us",
        to: "server@c.us",
        body,
        timestamp: Date.now() / 1000,
        ack: -1,
        deviceType: 'local',
        isForwarded: false,
        isStatus: false,
        isStarred: false,
        broadcast: false,
        fromMe: false,
        location: undefined,
        hasQuotedMsg: false,
        hasMedia: typeof body != 'string',
        id: {
            fromMe: false,
            remote: '911270016969@c.us',
            id: msg_id,
            _serialized: `false_911270016969@c.us_${msg_id}`
        },
        links: (body?.match?.(url_regex) ?? []).map(link => ({ link })),
        /**
         * @param {import('whatsapp-web.js').MessageContent} body
         * @param {string} chatId
         * @param {import('whatsapp-web.js').MessageSendOptions} options
         */
        reply: async (body, chatId = undefined, options = {}) => {
            const new_options = Object.assign(options, { quotedMessageId: chatId || msg_id });
            return await client.sendMessage(from.id._serialized, body, new_options);
        },
        getContact: async () => { return from; },
        getChat: async () => { return makePrivateChat(from); }
    };
};

/** Creates a template private chat object from a contact.
 *
 * @param {import('whatsapp-web.js').Contact} contact Contact to create the chat from.
 * @returns {import('whatsapp-web.js').PrivateChat} The chat object.
 */
function makePrivateChat(contact) {
    return {
        archived: undefined,
        isGroup: false,
        pinned: false,
        isReadOnly: false,
        isMuted: false,
        muteExpiration: 0,
        name: from.pushname,
        timestamp: Date.now() / 1000,
        unreadCount: 0,
        id: contact.id,
        /**
         * @param {import('whatsapp-web.js').MessageContent} body
         * @param {import('whatsapp-web.js').MessageSendOptions} options
         */
        sendMessage: async (body, options = {}) => {
            return await client.sendMessage(contact.id._serialized, body, options);
        },
        sendSeen: async () => {}
    };
}
/** Creates a template group chat object from a list of admin and non-admin contacts.
 *
 * @param {string[]} admins List of admin contacts.
 * @param {string[]} non_admins List of non-admin contacts.
 * @returns {import('whatsapp-web.js').GroupChat} The chat object.
 */
function makeGroupChat(admins = [], non_admins = []) {
    const create_time = Date.now();
    return {
        owner: from.id,
        createdAt: new Date(create_time),
        archived: undefined,
        isGroup: true,
        pinned: false,
        isReadOnly: false,
        isMuted: false,
        muteExpiration: 0,
        name: "Local Group",
        timestamp: Date.now() / 1000,
        unreadCount: 0,
        id: {
            _serialized: `911270016969-${create_time/1000}@g.us`,
            user: `911270016969-${create_time/1000}`,
            server: "g.us"
        },
        participants: [
            ...admins.map(code => {
                const at = code.indexOf('@');
                return {
                    isAdmin: true,
                    isSuperAdmin: true,
                    id: {
                        _serialized: code,
                        user: code.slice(0, at),
                        server: code.slice(at+1)
                    }
                };
            }),
            ...non_admins.map(code => {
                const at = code.indexOf('@');
                return {
                    isAdmin: false,
                    isSuperAdmin: false,
                    id: {
                        _serialized: code,
                        user: code.slice(0, at),
                        server: code.slice(at+1)
                    }
                };
            })
        ],
        /**
         * @param {import('whatsapp-web.js').MessageContent} body
         * @param {import('whatsapp-web.js').MessageSendOptions} options
         */
        sendMessage: async (body, options = {}) => {
            return await client.sendMessage(this.id._serialized, body, options);
        },
        sendSeen: async () => {}
    };
}

module.exports = {
    client,
    from,
    makeMessage,
    makePrivateChat,
    makeGroupChat
};