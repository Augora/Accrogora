'use strict';

/**
 * An asynchronous bootstrap function that runs before
 * your application gets started.
 *
 * This gives you an opportunity to set up your data model,
 * run jobs, or perform some special logic.
 *
 * See more details here: https://strapi.io/documentation/developer-docs/latest/setup-deployment-guides/configurations.html#bootstrap
 */

module.exports = async () => {
  process.nextTick(() =>{
    const io = require('socket.io')(strapi.server, {
      cors: {
        origin: [
          "http://localhost:3000",
          "https://440.pullrequests.augora.fr",
          "https://preprod.augora.fr",
          "https://augora.fr",
        ],
        // origin: "*",
        methods: ["GET", "POST"],
        // allowedHeaders: ["my-custom-header"],
        // credentials: true
      }
    });

    // Imports
    const jwt = require('jsonwebtoken');
    const axios = require('axios');

    // Constants
    const secret = process.env.JWT_SECRET

    // App variables
    const actives = {
      people: null,
      overview: null,
      question: '',
      bannerState: ''
    }
    let serveurURI
    process.env.NODE_ENV === 'production'
      ? serveurURI = 'https://accrogora.herokuapp.com'
      : serveurURI = 'http://localhost:1337'

    // Question variables
    let lastDepute = {};
    let respGovernment = {};

    // Authentication checker
    const checkAuth = (socket, next = null) => {
      if (socket.handshake.auth && socket.handshake.auth.token) {
        jwt.verify(socket.handshake.auth.token, secret, function(err, decoded) {
          if (err) {
            console.error('JSON Webtoken not valid', err)
            socket.disconnect();
            return false;
          };

          socket.decoded = decoded;

          axios.post(`${serveurURI}/auth/local`, {
            identifier: process.env.STRAPI_IDENTIFIER,
            password: process.env.STRAPI_PASSWORD,
          }).then(res => {
            axios.get(`${serveurURI}/users/${decoded.id}`, {
              headers: {'Authorization': `Bearer ${res.data.jwt}`}
            }).then((res) => {
              if (res.data.role.type === 'moderator' || res.data.role.type === 'admin') {
                if (next) {
                  return next()
                } else {
                  return true;
                }
              } else {
                socket.emit('message', 'You\'re not authorized to access this content')
                socket.disconnect();
                console.error('Not a moderator, disconnected')
                if (next) {
                  return next(new Error('Authentication error'))
                } else {
                  return false;
                }
              }
            }).catch((e) => {
              console.error('Error in veryfing authorization access')
              if (e.data) {
                console.error(e.data)
              }
              socket.disconnect();
              if (next) {
                return next(new Error('Authentication error'))
              } else {
                return false;
              }
            });
          })
        });
      } else {
        console.error('Not found or invalid JWT used for websockets')
        socket.disconnect();
        if (next) {
          return next(new Error('Authentication error'))
        } else {
          return false;
        }
      }
    }

    // Namespaces
    /*----------------------------------------------------*/
    const writerNamespace = io.of("/writer");
    const readerNamespace = io.of("/reader");

    // Writer
    /*----------------------------------------------------*/
    // Verifry validity of token connection
    writerNamespace.use(function(socket, next){
      checkAuth(socket, next)
    })

    // On connection
    writerNamespace.on('connection', async function(socket) {
      // Verifies if request is made by a moderator
      checkAuth(socket)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`A WRITER client with ID of ${socket.id} connected!`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)

      // If already selected elements, loads them
      /*----------------------------------------------------*/
      Object.keys(actives).forEach(key => {
        if (actives[key] !== '' && actives[key] !== null) {
          console.log(`[WRITER] Got already active ${key} : `, actives[key]);
          socket.emit(key, actives[key])
        }
      })

      // Socket handlers
      /*----------------------------------------------------*/
      // Connection acquired
      // send message on user connection
      socket.emit('message', 'CONTROLLER bien connecté');

      socket.on('message', message => {
        console.log('message', message)
      })
      socket.on('depute_write', (people) => {
        // Logs server with selected data
        console.log(`---------------------- New ${
            people.type === 'dep' ? 'Depute'
          : people.type === 'gov' ? 'Government'
          : null
        } loaded -------------------`)
        if (people) {
          console.log(people)
        }
        console.log('--------------------------------------------------------')

        // If it's a Depute, register last active Depute
        if (people.type === 'dep') {
          // If there's an active question
          if (actives.question.length) {
            axios.post(`${serveurURI}/auth/local`, {
              identifier: process.env.STRAPI_IDENTIFIER,
              password: process.env.STRAPI_PASSWORD,
            }).then(res => {
              // Construct data to send to creates the question
              const question_data = {
                question_content: actives.question,
                question_depute_slug: lastDepute.slug,
              }
              if (respGovernment.name) {
                question_data.question_government_name = respGovernment.name
              }
              if (respGovernment.office) {
                question_data.question_government_office = respGovernment.office
              }
              axios.post(`${serveurURI}/questions`,
                question_data,
                {
                  headers: {
                    "Authorization": `Bearer ${res.data.jwt}`
                  }
                }
              ).then(res => {
                console.log(`Question créée avec l\'id ${res.data.id}`)
                // Reset question
                socket.emit('reset_question')
                io.of("/reader").emit('question', '')
                actives.question = ''

                // Send new depute
                socket.emit('people', people)
                io.of("/reader").emit('people', people)
                actives.people = people

                // Send new banner state
                socket.emit('bannerState', people.type)
                io.of("/reader").emit('bannerState', people.type)
                actives.bannerState = people.type

                lastDepute = {
                  slug: people.Slug
                }

              }).catch(err => {
                console.error('Couldn\'t register question', err)
              })
            })
          } else { // If no question has been asked before
            socket.emit('people', people)
            io.of("/reader").emit('people', people)
            actives.people = people

            socket.emit('bannerState', people.type)
            io.of("/reader").emit('bannerState', people.type)
            actives.bannerState = people.type

            // Update lastDepute for strapi data
            lastDepute = {
              slug: people.Slug
            }
          }
        } else if (people.type === 'gov') {
          // If People is a member of the government
          socket.emit('people', people)
          io.of("/reader").emit('people', people)
          actives.people = people

          socket.emit('bannerState', people.type)
          io.of("/reader").emit('bannerState', people.type)
          actives.bannerState = people.type

          // Update respGovernment for strapi data
          respGovernment = {
            name: people.Nom,
            office: people.Office.office_name
          }
        }
      })

      socket.on('question', question => {
        io.of("/reader").emit('question', question)
        actives.question = question
      })

      socket.on('overview', overview => {
        socket.emit('overview', overview)
        io.of("/reader").emit('overview', overview)
        actives.overview = overview
      })

      socket.on('bannerState', banner => {
        console.log('Banner State changed to : ', banner)
        socket.emit('bannerState', banner)
        io.of("/reader").emit('bannerState', banner)
        actives.bannerState = banner

        if (banner === 'intro' || banner === 'outro') {
          socket.emit('reset_question')
          io.of("/reader").emit('question', '')
          actives.question = ''
        }
      })

      // listen for user diconnect
      socket.on('disconnect', () =>{
        console.log('a user disconnected')
      });
    });

    // Reader
    /*----------------------------------------------------*/
    readerNamespace.on('connection', async function(socket) {
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`A READER client with ID of ${socket.id} connected!`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`)
      console.log('actives.people', actives.people)
      console.log('actives.overview', actives.overview)
      console.log('actives.question', actives.question)
      console.log('actives.bannerState', actives.bannerState)
      // If already selected elements, loads them
      Object.keys(actives).forEach(key => {
        if (actives[key] !== '' && actives[key] !== null) {
          console.log(`[READER] Got already active ${key} : `, actives[key]);
          socket.emit(key, actives[key])
        }
      })
      socket.emit('message', 'READER bien connecté');
    })

    strapi.io = io; // register socket io inside strapi main object to use it globally anywhere
  })
};
