// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const moment = require('moment-timezone');
moment.tz.setDefault('Europe/Paris');
moment.locale('fr');

const privatekey = require('./secret.json');


const meetingsRooms = [
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
    {id: 12, name: "chien", numberOfPersons: 50},
];

const meetingsRoomsNames = meetingsRooms.map(function (item) {
    return item.name
}).join(', ');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    function searchARoom(calendarId, agent, parameters) {
        console.log("search a room function", parameters);
        let date = parameters.date;
        let time = parameters.time;
        let duration = parameters.duration;


        const isSquareFerme = (calendarId === 'rikeddg9ebiras8ptmstro0um0@group.calendar.google.com');
        // première recherche dans l'agenda square fermé
        if (isSquareFerme) {
            agent.add(`Je regarde ce qui est disponible pour le ${moment(date).format("DD MMMM")} à ${moment(time).tz('Europe/Paris').format("HH:mm")}, pour une durée de ${duration.amount} ${duration.unit}...`);
        }
        else {
            agent.add(`Je regarde ce qui est disponible dans l'agenda square ouvert...`);
        }

        let jwtClient = new google.auth.JWT(
            privatekey.client_email,
            null,
            privatekey.private_key,
            ['https://www.googleapis.com/auth/calendar.readonly']);


        const dateSearched = moment(date);
        const year = dateSearched.format('YYYY');
        const month = dateSearched.format('MM');
        const day = dateSearched.format("DD");

        const timeSearched = moment(time).tz('Europe/Paris');
        const hour = timeSearched.format("HH");
        const minutes = timeSearched.format("mm");

        const searched = moment(`${year}-${month}-${day} ${hour}:${minutes}`);
        const searchedEnd = moment(`${year}-${month}-${day} ${hour}:${minutes}`).add(duration.amount, duration.unit.charAt(0));
        console.log('SEARCH = ', searched.format());
        console.log('SEARCH END = ', searchedEnd.format());
        const calendar = google.calendar('v3');


        return new Promise((resolve, reject) => {
            calendar.events.list({
                auth: jwtClient,
                calendarId: calendarId,
                //maxResults: 20,
                //orderBy: "startTime",
                timeMin: moment(`${year}-${month}-${day} 00:00`).format(),
                timeMax: moment(`${year}-${month}-${day} 23:59`).format(),
                fields: "kind, items(start, end, summary, location)",
                singleEvents: true, // to hack recurring events
            }, function (error, response) {
                // Handle the results here (response.result has the parsed body).
                let busyRooms = [];

                let errors = [];
                if (typeof response != "undefined") {
                    console.log("Response", response.data.items);
                    //console.log("error", response.data.items[0].start);

                    if (response.data && response.data.items) {
                        for (let index in response.data.items) {
                            let event = response.data.items[index];
                            // using UTC time here to avoid timezone issue created by recurring events
                            let eventStart = moment(event.start.dateTime);
                            let eventEnd = moment(event.end.dateTime);

                            // add here the condition on end time of the meeting
                            if (
                                (searched.isSameOrAfter(eventStart) && searched.isSameOrBefore(eventEnd)) ||
                                (searchedEnd.isSameOrAfter(eventStart) && searchedEnd.isSameOrBefore(eventEnd))
                            ) {
                                let eventName = event.summary.toLowerCase();
                                //console.log("busy room for eventName", eventName);
                                let location = "non défini";
                                if (typeof event.location != "undefined") {
                                    // lower case  et retirer les accents
                                    location = event.location.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                                }
                                let foundARoom = false;
                                for (let i in meetingsRooms) {
                                    let roomName = meetingsRooms[i].name;
                                    //console.log("Testing the room", roomName);
                                    // si la salle est nommée
                                    if (location.indexOf(roomName) > -1 || eventName.indexOf(roomName) > -1) {
                                        busyRooms.push(meetingsRooms[i]);
                                        console.log("Room ", roomName, " is busy with the event ", eventName, location);
                                        foundARoom = true;
                                        break;
                                    }
                                }
                                if (foundARoom === false) {
                                    errors.push(eventName + " - " + location);
                                }
                            }
                        }
                    }
                }

                let availableRooms = [];
                for (let i in meetingsRooms) {
                    let room = meetingsRooms[i];
                    let isBusy = false;
                    for (let j in busyRooms) {
                        let busy = busyRooms[j].id;
                        if (busy === room.id) {
                            isBusy = true;
                        }
                    }
                    if (isBusy === false) {
                        availableRooms.push(room);
                    }
                }
                //console.log("availableRooms", availableRooms);

                // output de ce qui est disponible
                if (isSquareFerme) {

                    let output;
                    if (availableRooms.length > 1) {
                        let roomNames = availableRooms.map(function (item) {
                            return `${item.id}.${item.name} (${item.numberOfPersons} p)`;
                        }).join(", ");
                        output = agent.add(`J'ai trouvé plusieurs salles disponibles : ${roomNames}`);
                    } else if (availableRooms.length == 1) {
                        output = agent.add(`Il ne reste qu'une seule salle disponible : ${availableRooms[0].name}`);
                    } else if (availableRooms.length == 0) {
                        output = agent.add(`Je suis désolé, mais je n'ai pas trouvé de salle disponible...`);
                    }
                }
                else {
                    if (busyRooms.length > 0) {
                        let busyRoomNames = busyRooms.map(function (item) {
                            return `${item.id}.${item.name}`
                        }).join(', ');
                        agent.add(`Certaines salles sont réservées sur l'agenda ouvert : ${busyRoomNames}`);
                    }
                    else {
                        agent.add(`Aucune réservation sur cet agenda`);

                    }
                }


                // output des erreurs
                if (errors.length > 0) {
                    let errorsText = errors.join(', ');
                    agent.add(`J'ai eu un problème avec : ${errorsText}. Il faudrait mieux que tu vérifies toi même l'agenda ici : https://calendar.google.com/calendar/r`)
                }


                // fin du dialogue, invitation à la suite
                if (isSquareFerme) {
                    agent.add("Veux tu que je regarde aussi dans l'agenda Square ouvert ?")
                    agent.setContext({'name': 'room', 'lifespan': 2, 'parameters': agent.parameters});
                } else {
                    agent.add(`Veux tu que je t'aide à réserver une salle ? Si oui, dis moi quelle salle réserver`);
                }
                resolve();
            });
        });

    }

    // Uncomment and edit to make your own intent handler
    // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
    // below to get this function to be run when a Dialogflow intent is matched
    function lookupForAMeetingRoom(agent) {

        return searchARoom('rikeddg9ebiras8ptmstro0um0@group.calendar.google.com', agent, agent.parameters)


    }

    function lookupForAMeetingRoomInSquareOuvert(agent) {
        let context = agent.getContext('room');
        if (typeof context === "undefined") {
            agent.add(`Je n'ai pas compris, recommençons à zéro si tu veux bien`);
            return;
        }

        return searchARoom('gm1l9afi00ol3ism78svc5mt2k@group.calendar.google.com', agent, context.parameters);

    }

    function bookARoom(agent) {
        console.log("bookARoom ", agent.parameters);
        console.log("bookARoom context", agent.getContext('room'));
        let context = agent.getContext('room');
        if (typeof context === "undefined") {
            agent.add(`Je n'ai pas compris, recommençons à zéro si tu veux bien`);
            return;
        }
        let selectedRoom = null;
        for (let index in meetingsRooms) {
            let room = meetingsRooms[index];
            if (room.name === context.parameters.roomName) {
                selectedRoom = room;
                break;
            }
        }
        if (selectedRoom === null) {
            agent.add("Je n'ai pas trouvé la salle dont tu parles");
            agent.add(`Voici les salles que je connais : ${meetingsRoomsNames}`);
            agent.ask("Peux tu me donner un nom de salle ?")
            return;
        }
        let roomName = `${selectedRoom.id}.${selectedRoom.name} (${selectedRoom.numberOfPersons} p)`;
        let roomNameForEvent = `${selectedRoom.id}.${selectedRoom.name}`;

        let date = context.parameters.date;
        let time = context.parameters.time;
        let duration = context.parameters.duration;

        const dateSearched = moment(date);
        const year = dateSearched.format('YYYY');
        const month = dateSearched.format('MM');
        const day = dateSearched.format("DD");

        const timeSearched = moment(time).tz('Europe/Paris');
        const hour = timeSearched.format("HH");
        const minutes = timeSearched.format("mm");

        const searched = moment(`${year}-${month}-${day} ${hour}:${minutes}`);
        const searchedEnd = moment(`${year}-${month}-${day} ${hour}:${minutes}`).add(duration.amount, duration.unit.charAt(0));

        const start = searched.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const end = searchedEnd.toISOString().replace(/-|:|\.\d\d\d/g, "");

        agent.add(`Voici le lien pour te permettre de réserver la salle ${roomName} pour le ${moment(date).format("DD MMMM")} à ${moment(time).tz('Europe/Paris').format("HH:mm")}, pour une durée de ${duration.amount} ${duration.unit} : `)

        let link = `https://calendar.google.com/calendar/r/eventedit?src=rikeddg9ebiras8ptmstro0um0@group.calendar.google.com&text=%5BFermé%5D&dates=${start}/${end}&details=Cree+automatiquement+par+un+bot&location=${roomNameForEvent}&sf=true&output=xml`;

        agent.add(link);
        agent.add("Si la page est blanche, vérifies que le compte actif est celui qui te permet l'accès à l'agenda du square en haut à droite");
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Recherche salle de reunion', lookupForAMeetingRoom);
    intentMap.set('Recherche square ouvert - yes', lookupForAMeetingRoomInSquareOuvert);
    intentMap.set('reservation de salle - yes - yes', bookARoom);
    // intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
});
