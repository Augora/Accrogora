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

          axios
            .post("https://accrogora.herokuapp.com/auth/local", {
              identifier: process.env.STRAPI_IDENTIFIER,
              password: process.env.STRAPI_PASSWORD,
            })
            .then((res) => {
              return axios.get(`https://accrogora.herokuapp.com/users/${decoded.id}`, {
                headers: {'Authorization': `Bearer ${res.data.jwt}`}
              })
            }
            )
            .then((res) => {
              if (!res.data.moderator) {
                socket.disconnect();
                console.error('Not a moderator')
                return false;
              } else {
                return true;
              }
            })
            .catch((e) => {
              socket.disconnect();
              return false;
            });
        });
      } else {
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

          axios
            .post("https://accrogora.herokuapp.com/auth/local", {
              identifier: process.env.STRAPI_IDENTIFIER,
              password: process.env.STRAPI_PASSWORD,
            })
            .then((res) => {
              return axios.get(`https://accrogora.herokuapp.com/users/${decoded.id}`, {
                headers: {'Authorization': `Bearer ${res.data.jwt}`}
              })
            }
            )
            .then((res) => {
              if (res.data.moderator) {
                next();
              } else {
                socket.disconnect();
                console.error('Not a moderator')
                return next(new Error('Authentication error : Not a moderator'))
              }
            })
            .catch((e) => {
              console.error('Catch axios get', e)
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
      // Connection acquired
      console.log(`A CONTROLLER client with ID of ${socket.id} connected!`)
      // send message on user connection
      socket.emit('message', 'CONTROLLER bien connecté');

      socket.on('message', message => {
        checkAuth(socket)
        console.log('message', message)
      })
      socket.on('depute_write', depute => {
        checkAuth(socket)
        console.log('---------------------- depute_change -------------------')
        console.log(depute.Nom)
        console.log('--------------------------------------------------------')
        // activeDepute = depute
        socket.emit('depute_read', depute)
        io.of("/reader").emit('depute_read', depute)
      })
      socket.on('question', question => {
        checkAuth(socket)
        io.of("/reader").emit('question', question)
      })
      socket.on('overview', overview => {
        checkAuth(socket)
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
