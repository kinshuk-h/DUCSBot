const { template, join } = require("./template");

const replies = {
    greeting: "Hello! Welcome to DUCSS Panel, University of Delhi!\n\n"+
              "Here you can stay updated with all events around you!",
    welcome_back: template`Hi ${0}! Welcome back!`,
    about: "DUCSS Panel Bot, for all your event needs, and more!\n\n"+
           "Copyright (C) The DUCS Developers, 2022",
    prompt: {
        name: "Your good name?",
        college: template`Hi ${0}, which college are you from? Let us know using the list below!`,
        college_name: `Not from the colleges from that list? No worries! Let us know the name of your college.`,
        error: "That doesn't seem right. Let's try again."
    },
    college: {
        title: "College Selection",
        description: "Select the college you are from, by specifying one of the options from the list below. "+
                     "In case your college is not listed, kindly select 'Other' and write your college name.",
        button_text: "View College List",
        section_title: "Colleges",
    },
    describe_user: join(
        template`Here's what we recorded so far:\n\n`,
        template`Name: ${'name'}\nCollege: ${'college'}\nLanguage: ${'lang'}`
    )
};

module.exports = exports = replies;