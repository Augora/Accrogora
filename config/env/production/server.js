module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  url: env('https://accrogora.herokuapp.com'),
});
