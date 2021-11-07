module.exports = {
  tokenDecrypt: async function(ctx) {
    // get token froml the POST request
    const {token} = ctx.request.body;

    // check toek requirement
    if (!token) {
      return ctx.badRequest('`token` param is missing')
    }

    try {
      // decrypt the jwt
      const obj = await strapi.plugins[
        'users-permissions'
      ].services.jwt.verify(token);

      // send the decrypted object
      return obj;
    } catch (err) {
      // if the token is not a valid token it will throw and error
      return ctx.badRequest(err.toString());
    }
  }
};
