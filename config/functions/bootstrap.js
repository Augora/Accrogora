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
    const jwt = require('jsonwebtoken');
    const axios = require('axios');
    // let activeDepute = null;

    // Namespaces
    /*----------------------------------------------------*/
    const writerNamespace = io.of("/writer");
    const readerNamespace = io.of("/reader");

    // Writer
    /*----------------------------------------------------*/
    writerNamespace.use(function(socket, next){
      const secret = process.env.JWT_SECRET || '2961ffdc-74eb-46a3-97fe-19e75f49b439'
      if (socket.handshake.auth && socket.handshake.auth.token) {
        jwt.verify(socket.handshake.auth.token, secret, function(err, decoded) {
          if (err) {
            console.log('err', err)
            return next(new Error('Authentication error'))
          };

          socket.decoded = decoded;
          console.log('decoded', decoded)

          axios
            .post("https://accrogora.herokuapp.com/auth/local", {
              identifier: process.env.STRAPI_IDENTIFIER,
              password: process.env.STRAPI_PASSWORD,
            })
            .then((data) => axios.get(`https://accrogora.herokuapp.com/users/${decoded.id}`, {
              headers: {'Authorization': `Bearer ${data.jwt}`}
            }))
            .then((data) => {
              if (data.moderator) {
                next();
              } else {
                return next(new Error('Authentication error'))
              }
            })
            .catch((e) => {
              console.log(e.err)
              return next(new Error('Authentication error'))
            });
        });
      }
      else {
        next(new Error('Authentication error'));
      }
    })
    writerNamespace.on('connection', async function(socket) {
      // Connection acquired
      console.log(`A CONTROLLER client with ID of ${socket.id} connected!`)
      // send message on user connection
      socket.emit('message', 'CONTROLLER bien connecté');

      socket.on('message', message => {
        console.log('message', message)
      })
      socket.on('depute_write', depute => {
        console.log('---------------------- depute_change -------------------')
        console.log(depute.Nom)
        console.log('--------------------------------------------------------')
        // activeDepute = depute
        socket.emit('depute_read', depute)
        io.of("/reader").emit('depute_read', depute)
      })
      socket.on('question', question => {
        io.of("/reader").emit('question', question)
      })
      socket.on('overview', overview => {
        io.of("/reader").emit('overview', overview)
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
      socket.emit('message', 'READER bien connecté');
    })

    strapi.io = io; // register socket io inside strapi main object to use it globally anywhere
  })
};
