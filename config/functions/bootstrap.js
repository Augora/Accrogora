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

    // Variables
    let activePeople = null;
    let activeOverview = null;
    let activeQuestion = null;

    // Serveur authentication
    let adminJWT = null
    axios
      .post("https://accrogora.herokuapp.com/auth/local", {
        identifier: process.env.STRAPI_IDENTIFIER,
        password: process.env.STRAPI_PASSWORD,
      }).then(res => {
        console.log('Admin authentified, token is : ', res.data.jwt)
        adminJWT = res.data.jwt
      }).catch(err => {
        console.error('AdminJWT Auth Failed : ', err)
        adminJWT = null
      })

    // Authentication checker
    const checkAuth = (socket) => {
      const secret = process.env.JWT_SECRET
      console.log("socket.handshake.auth.token", socket.handshake.auth.token)
      if (socket.handshake.auth && socket.handshake.auth.token) {
        jwt.verify(socket.handshake.auth.token, secret, function(err, decoded) {
          if (err) {
            console.error('JSON Webtoken not valid', err)
            socket.disconnect();
            return false;
          };

          socket.decoded = decoded;

          axios.get(`https://accrogora.herokuapp.com/users/${decoded.id}`, {
            headers: {'Authorization': `Bearer ${adminJWT}`}
          }).then((res) => {
            if (!res.data.moderator) {
              socket.emit('message', 'You\'re not authorized to access this content')
              socket.disconnect();
              console.error('Not a moderator, disconnected')
              return false;
            } else {
              return true;
            }
          }).catch((e) => {
            console.error('Error in veryfing authorization access')
            if (e.data) {
              console.error(e.data)
            }
            socket.disconnect();
            return false;
          });
        });
      } else {
        console.error('Not found or invalid JWT used for websockets')
        socket.disconnect();
        return false;
      }
    }

    // Namespaces
    /*----------------------------------------------------*/
    const writerNamespace = io.of("/writer");
    const readerNamespace = io.of("/reader");

    // Writer
    /*----------------------------------------------------*/
    writerNamespace.use(function(socket, next){
      const secret = process.env.JWT_SECRET
      console.log("socket.handshake.auth.token", socket.handshake.auth.token)
      if (socket.handshake.auth && socket.handshake.auth.token) {
        jwt.verify(socket.handshake.auth.token, secret, function(err, decoded) {
          if (err) {
            console.error('JSON Webtoken not valid', err)
            return next(new Error('Authentication error'))
          };

          socket.decoded = decoded;
          console.log('socket.decoded', socket.decoded)

          axios.get(`https://accrogora.herokuapp.com/users/${decoded.id}`, {
            headers: {'Authorization': `Bearer ${adminJWT}`}
          }).then((res) => {
            if (res.data.moderator) {
              next();
            } else {
              socket.disconnect();
              console.error('Not a moderator')
              return next(new Error('Authentication error : Not a moderator'))
            }
          }).catch((e) => {
            console.error('Catch axios get', e.data)
            return next(new Error('Authentication error'))
          });
        });
      }
      else {
        console.error('Requires socket handshake and token')
        next(new Error('Authentication error'));
      }
    })
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

        // Emit events
        socket.emit('depute_read', people, type)
        io.of("/reader").emit('depute_read', people, type)
        activePeople = people
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
