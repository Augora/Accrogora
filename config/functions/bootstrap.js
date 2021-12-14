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

    // Constants
    const jwt = require('jsonwebtoken');
    const axios = require('axios');
    const serveurURI = 'http://localhost:1337'
    const secret = process.env.JWT_SECRET

    // App variables
    let activePeople = null;
    let activeOverview = null;
    let activeQuestion = '';

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
      console.log(`A CONTROLLER client with ID of ${socket.id} connected!`)

      // If already selected elements, loads them
      console.log('activePeople', activePeople)
      if (activePeople) {
        socket.emit('depute_read', activePeople)
      }
      if (activeOverview) {
        socket.emit('overview', activeOverview)
      }
      if (activeQuestion) {
        socket.emit('question', activeQuestion)
      }

      // Connection acquired
      // send message on user connection
      socket.emit('message', 'CONTROLLER bien connecté');

      socket.on('message', message => {
        console.log('message', message)
      })
      socket.on('depute_write', (people, type) => {
        // Logs server with selected data
        console.log(`---------------------- New ${type === 'dep' ? 'Depute' : 'Government'} loaded -------------------`)
        console.log(people)
        console.log('--------------------------------------------------------')

        // If it's a Depute, register last active Depute
        if (people.hasOwnProperty('__typename')) {
          // If there's an active question
          if (activeQuestion.length) {
            axios.post(`${serveurURI}/auth/local`, {
              identifier: process.env.STRAPI_IDENTIFIER,
              password: process.env.STRAPI_PASSWORD,
            }).then(res => {
              // Construct data to send to creates the question
              const question_data = {
                question_content: activeQuestion,
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
                lastDepute = {
                  slug: people.Slug
                }
                socket.emit('reset_question')
                io.of("/reader").emit('question', '')

                // Emit events
                socket.emit('depute_read', people, type)
                io.of("/reader").emit('depute_read', people, type)
                activePeople = people
              }).catch(err => {
                console.error('Couldn\'t register question', err.response)
                if (err.response.data) {
                  console.error(err.response.data.data)
                }
              })
            })
          } else {
            // If no question has been asked before
            socket.emit('depute_read', people, type)
            io.of("/reader").emit('depute_read', people, type)
            activePeople = people
            lastDepute = {
              slug: people.Slug
            }
          }
        } else {
          // If People is a member of the government
          socket.emit('depute_read', people, type)
          io.of("/reader").emit('depute_read', people, type)
          activePeople = people
          respGovernment = {
            name: people.Nom,
            office: people.Office.office_name
          }
        }
      })
      socket.on('question', question => {
        io.of("/reader").emit('question', question)
        activeQuestion = question
      })
      socket.on('overview', overview => {
        socket.emit('overview', overview)
        io.of("/reader").emit('overview', overview)
        activeOverview = overview
      })

      // listen for user diconnect
      socket.on('disconnect', () =>{
        console.log('a user disconnected')
      });
    });

    // Reader
    /*----------------------------------------------------*/
    readerNamespace.on('connection', async function(socket) {
      console.log(`A READER client with ID of ${socket.id} connected!`)
      console.log('activePeople', activePeople)
      console.log('activeOverview', activeOverview)
      console.log('activeQuestion', activeQuestion)
      // If already selected elements, loads them
      activePeople
        ? socket.emit('depute_read', activePeople)
        : socket.emit('intro')
      activeQuestion
        ? socket.emit('question', activeQuestion)
        : null
      activeOverview
        ? socket.emit('overview', activeOverview)
        : null
      socket.emit('message', 'READER bien connecté');
    })

    strapi.io = io; // register socket io inside strapi main object to use it globally anywhere
  })
};
