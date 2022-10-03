const WWebJS = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const replies    = require('./i18n/replies');
const utils      = require('./utils/common');
const DialogFlow = require('./utils/dialogflow');
const WWebUtils  = require('./utils/wwebjs-utils');

const COMMAND_PRIMERS = [ '/', '!', '\\' ];
const DEFAULT_USER = {
    lang: 'en', state: undefined,
    name: undefined, college: undefined
};

const users   = new utils.JSONHandler("./data/users.json");
const globals = new utils.JSONHandler("./data/globals.json");
const active_flows = {};

const dialogflow = new DialogFlow({
    INITIAL: async context => {
        const { message, client, user, user_id, body } = context;
        if(user.name && user.college) {
            client.sendMessage(message.from, replies[user.lang].welcome_back(user.name));
            return [ 'SHOW_DETAILS', false ];
        }
        else {
            client.sendMessage(message.from, replies[user.lang].greeting);
            return [ 'PROMPT_NAME', false ];
        }
    },
    PROMPT_NAME: async context => {
        const { message, client, user, user_id, body } = context;
        client.sendMessage(message.from, replies[user.lang].prompt.name);
        return [ 'REGISTER_NAME', true ];
    },
    REGISTER_NAME: async context => {
        const { message, client, user, user_id, body } = context;
        if(!/\p{L}[\p{L}\p{N}\p{Z}]+/miu.test(body))
            return [ 'WRONG_INPUT', false, { return_state: 'PROMPT_NAME' } ];

        if(!users.JSON.hasOwnProperty(user_id))
            users.JSON[user_id] = {}
        users.JSON[user_id].name = body;
        users.sync();

        return [ 'PROMPT_COLLEGE', false, { user: users.JSON[user_id] } ];
    },
    PROMPT_COLLEGE: async context => {
        const { message, client, user, user_id, body, for_name = false } = context;
        if(for_name) {
            client.sendMessage(message.from, replies[user.lang].prompt.college_name);
        }
        else {
            client.sendMessage(message.from, replies[user.lang].prompt.college(user.name));
            client.sendMessage(message.from, new WWebJS.List(
                replies[user.lang].college.description,
                replies[user.lang].college.button_text,
                [
                    {
                        title: replies[user.lang].college.section_title,
                        rows: [
                            ...globals.JSON.colleges.map(college => ({ title: college })),
                            { title: "Other" }
                        ]
                    }
                ],
                replies[user.lang].college.title
            ));
        }
        return [ 'REGISTER_COLLEGE', true ];
    },
    REGISTER_COLLEGE: async context => {
        const { message, client, user, user_id, body } = context;
        if(message.type == 'list_response' && body == "Other")
            return [ 'PROMPT_COLLEGE', false, { for_name: true } ];
        else if(message.type == 'chat') {
            if(!body)
                return [ 'WRONG_INPUT', false, { return_state: 'PROMPT_COLLEGE' } ];
            else {
                globals.JSON.colleges.splice(-2, 0, body);
                globals.sync();
            }
        }

        if(!users.JSON.hasOwnProperty(user_id))
            users.JSON[user_id] = {}
        users.JSON[user_id].college = body;
        users.sync();

        return [ 'SHOW_DETAILS', false, { user: users.JSON[user_id] } ];
    },
    SHOW_DETAILS: async context => {
        const { message, client, user, user_id, body } = context;
        client.sendMessage(message.from, replies[user.lang].describe_user(user));
        return [ 'IDLE', true ];
    },
    IDLE: async _ => {
        return [ 'IDLE', true ];
    },
    WRONG_INPUT: async context => {
        const { message, client, user, user_id, body } = context;
        client.sendMessage(message.from, replies[user.lang].prompt.error);
        return [ context.return_state, false ];
    }

}, 'INITIAL');

async function handleMessage(client, message) {
    const user_id = message.author || message.from;

    // Safeguard against messages from others, for testing purposes.
    if(user_id != "918468086504@c.us" && user_id != "911270016969@c.us")
        return;

    const user = Object.assign(DEFAULT_USER, users.JSON?.[user_id] || {});
    let body = message.body || '';

    if(message.type != "location" && COMMAND_PRIMERS.includes(body.charAt(0))) {
        let command_str = body.slice(1).trim(), pos = command_str.match(/\s/u)?.index ?? -1,
            command     = (pos != -1 ? command_str.slice(0, pos) : command_str)
                            .toLocaleLowerCase().replaceAll("-","").replaceAll("_","");
        let query = pos == -1 ? '' : command_str.slice(command.length + 1).trim();

        console.log(`> Executing /${command_str} ...`);

        // switch(command) {
        //     case 'lang': {
        //         const new_lang = query.slice(2).toLowerCase();

        //         if(!replies.hasOwnProperty(new_lang)) {
        //             client.sendMessage(message.from, replies[user.lang ?? 'en'].lang.no_such_lang(
        //                 new_lang, Object.getOwnPropertyNames(replies).join(', ')
        //             ));
        //             return;
        //         }

        //         if(!users.JSON.hasOwnProperty(user_id))
        //             users.JSON[user_id] = {}
        //         users.JSON[user_id].lang = new_lang;
        //         users.sync();

        //         break;
        //     }
        // }
    }
    // else if(message.type == "list_response") {
    //     const decoded_command = WWebUtils.decodeFromId(message?.selectedRowId);
    //     if(decoded_command.charAt(0) == "/") {
    //         console.log("> Decoded command from list:", decoded_command);
    //         message.body = decoded_command; if(decoded_command.length < 2) return;
    //         await handleMessage(client, message, is_new, true, false); return;
    //     }
    // }
    // else if(message.type == "buttons_response") {
    //     const command = WWebUtils.decodeFromId(message?.selectedButtonId);
    //     if(command.charAt(0) == "/") {
    //         console.log("> Decoded command from button:", command);
    //         message.body = command; if(command.length < 2) return;
    //         await handleMessage(client, message, is_new, true, false); return;
    //     }
    // }
    else {
        const context = { client, message, user, user_id, body };
        if(!active_flows.hasOwnProperty(user_id))
            active_flows[user_id] = dialogflow.create(context);
        else
            dialogflow.continue(active_flows[user_id], context);
    }
}

if(require.main === module) {
    (function() {
        const client = new WWebJS.Client({
            authStrategy: new WWebJS.LocalAuth(),
            puppeteer: {
                headless: false
            }
        });

        client.on('qr', qr => {
            qrcode.generate(qr, {small: true});
        });
        client.on('auth_failure', msg => {
            console.error('> Authenication failed:', msg);
            client.destroy().then(()=>{ client.initialize(); })
            .catch((reason)=>{ console.error(reason); process.exit(1); });
        });
        client.on('disconnected', reason => {
            console.log('> Logout: ', reason);
            client.destroy().then(()=>{ client.initialize(); })
            .catch((reason)=>{ console.error(reason); process.exit(1); });
        });
        client.on('authenticated', () => {
            console.log('AUTHENTICATED');
        });
        client.on('auth_failure', msg => {
            // Fired if session restore was unsuccessful
            console.error('AUTHENTICATION FAILURE', msg);
        });

        client.on('ready', () => {
            console.log("Client ready.");
        });
        client.on('message', async message => {
            await handleMessage(client, message);
        });

        client.initialize();
    })();
}

module.exports = exports = {
    handleMessage
};