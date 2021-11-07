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
    var io = require('socket.io')(strapi.server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
      }
    });
    let activeDepute = null;
    io.on('connection', async function(socket) {
      console.log(`Client with ID of ${socket.id} connected!`)
      socket.join('accropolis')
      console.log('socket rooms : ', socket.rooms); // Set { <socket.id>, "room1" }
      // send message on user connection
      socket.emit('message', 'retour depuis le backend');

      socket.on('message', message => {
        console.log('message', message)
      })
      socket.on('req_depute', () => {
        console.log('Request a deputy')
        if (activeDepute) {
          socket.emit('resp_depute', activeDepute)
        }
      })
      socket.on('depute_write', depute => {
        console.log('---------------------- depute_change -------------------')
        socket.emit('message', 'depute_change from back')
        socket.to('accropolis').emit('message', 'depute_change from back')
        console.log(depute.Nom)
        activeDepute = depute
        socket.emit('depute_read', depute)
        socket.to('accropolis').emit('depute_read', depute)
        console.log('--------------------------------------------------------')
      })
      socket.on('question', question => {
        socket.to('accropolis').emit('question', question)
      })
      socket.on('overview', overview => {
        socket.to('accropolis').emit('overview', overview)
      })

      // listen for user diconnect
      socket.on('disconnect', () =>{
        console.log('a user disconnected')
      });
    });
    strapi.io = io; // register socket io inside strapi main object to use it globally anywhere
  })
};
