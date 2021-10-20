module.exports = ({ env }) => ({
  url: env('', 'https://accrogora.herokuapp.com'),
  admin: {
    auth: {
      secret: env('ADMIN_JWT_SECRET', 'b72ebbced687c9c3f0e5ad45bd20d7e7'),
    },
  },
});
