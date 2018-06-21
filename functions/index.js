// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const moment = require('moment');

const privatekey = require('./secret.json');


process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    //console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    //console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Uncomment and edit to make your own intent handler
    // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
    // below to get this function to be run when a Dialogflow intent is matched
    function lookupForAMeetingRoom(agent) {
        agent.add(`Je regarde ce qui est disponible...`);

        console.log("lookupForAMeetingRoom function")
        console.log(agent.parameters)

        let date = agent.parameters.date;
        let time = agent.parameters.time;
        let numberOfPersons = agent.parameters.numberOfPersons;

        let meetingsRooms = [
            {id: 1, name: "lion", numberOfPersons: 20},
            //{id: 2, name: "hydre", numberOfPersons: 5},
            {id: 3, name: "sanglier", numberOfPersons: 10},
            {id: 4, name: "biche", numberOfPersons: 10},
            {id: 5, name: "oiseau", numberOfPersons: 5},
            {id: 6, name: "taureau", numberOfPersons: 100},
            {id: 7, name: "jument", numberOfPersons: 10},
            {id: 8, name: "ceinture", numberOfPersons: 10},
            {id: 9, name: "ecurie", numberOfPersons: 10},
            {id: 10, name: "boeuf", numberOfPersons: 10},
            {id: 11, name: "pomme", numberOfPersons: 10},
            {id: 12, name: "chien", numberOfPersons: 100},
        ];

        let jwtClient = new google.auth.JWT(
            privatekey.client_email,
            null,
            privatekey.private_key,
            ['https://www.googleapis.com/auth/calendar.readonly']);

        const dateSearched = moment(date);
        const year = dateSearched.format('YYYY');
        const month = dateSearched.format('MM');
        const day = dateSearched.format("DD");

        const timeSearched = moment(time);
        const hour = timeSearched.format("HH")
        const minutes = timeSearched.format("mm")

        const searched = moment(`${year}-${month}-${day} ${hour}:${minutes}`);

        const calendar = google.calendar('v3');

        let resultIsHere = false;


        return new Promise((resolve, reject) => {
            calendar.events.list({
                auth: jwtClient,
                calendarId: 'rikeddg9ebiras8ptmstro0um0@group.calendar.google.com',
                //maxResults: 20,
                //orderBy: "startTime",
                timeMin: moment(`${year}-${month}-${day} ${hour}:${minutes}`).format(),
                timeMax: moment(`${year}-${month}-${day} ${hour}:${minutes}`).add(4, 'hours').format(),
                fields: "kind, items(start, end, summary, location)"
            }, function (error, response) {
                // Handle the results here (response.result has the parsed body).
                let availableRooms = [];

                if (typeof response != "undefined") {
                    console.log("Response", response.data.items);
                    console.log("error", response.data.items[0].start);

                    if (response.data && response.data.items) {
                        for (let index in response.data.items) {
                            let event = response.data.items[index];
                            let eventStart = moment(event.start.dateTime);
                            let eventEnd = moment(event.end.dateTime);
                            if (searched.isSameOrAfter(eventStart) && searched.isSameOrBefore(eventEnd)) {
                                console.log("busy room : ", event.location);
                                let location = event.location.toLowerCase();
                                let eventName = event.summary.toLowerCase();
                                for (let i in meetingsRooms) {
                                    let room = meetingsRooms[i];
                                    // si la salle est nommée
                                    if (location.indexOf(room.name) == -1 || eventName.indexOf(room.name) == -1) {
                                        availableRooms.push(room);
                                    }
                                }

                            }
                        }

                    } else {
                        availableRooms = meetingsRooms;
                    }
                } else {
                    availableRooms = meetingsRooms;
                }
                let output;
                if (availableRooms.length > 1) {
                    let roomNames = availableRooms.map(function (item) {
                        return item.name;
                    }).join(", ");
                    output = agent.add(`J'ai trouvé plusieurs salles disponibles : ${roomNames}`);
                } else if (availableRooms.length == 1) {
                    output = agent.add(`Il ne reste qu'une seule salle disponible : ${availableRooms[0].name}`);
                } else if (availableRooms.length == 0) {
                    output = agent.add(`Je suis désolé, mais je n'ai pas trouvé de salle disponible...`);
                }

                resolve(output);

                //agent.add(`J'ai trouvé des évènements ${JSON.stringify(response.data)}`);
            });
        });


        /*, function (error, response) {
         if (error) {
         console.error(error);
         } else {
         console.log(moment(`${year} - ${month} -${day}`).toISOString());
         console.log(moment(`${year} - ${month} -${day}`).add(12, 'hours').toISOString());
         console.log("calendar OK")
         //console.log(response.data.items)
         if (typeof response.data.items !== "undefined") {
         console.log(response.data.items.length);
         // so now we got the events of the day:
         // here are the usable fields:
         // start, end, summary, location


         agent.add(`J'ai trouvé ${response.data.items.length} évènements`);
         } else {
         agent.add(`
         Pas
         de
         réponse`);
         }


         }
         resultIsHere = true;


         });*/

        //        let calendar = google.calendar('v3');


        //   agent.add(`This message isfrom Dialogflow 's Cloud Functions for Firebase editor!`);
        //   agent.add(new Card({
        //       title: `Title: this is a card title`,
        //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
        //       buttonText: 'This is a button',
        //       buttonUrl: 'https://assistant.google.com/'
        //     })
        //   );
        //   agent.add(new Suggestion(`Quick Reply`));
        //   agent.add(new Suggestion(`Suggestion`));
        //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
    }

    // // Uncomment and edit to make your own Google Assistant intent handler
    // // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
    // // below to get this function to be run when a Dialogflow intent is matched
    // function googleAssistantHandler(agent) {
    //   let conv = agent.conv(); // Get Actions on Google library conv instance
    //   conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
    //   agent.add(conv); // Add Actions on Google library responses to your agent's response
    // }
    // // See https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
    // // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Recherche salle de réunion', lookupForAMeetingRoom);
    // intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
})
;
