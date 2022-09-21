const {google} = require('googleapis');
const http = require('http');
const url = require('url');
const open = require('open');
const fs = require('fs-extra');
const destroyer = require('server-destroy');

module.exports = async function getOAuth2Client(clientId, clientSecret, redirectUrl, scopes) {
  const oauthClient = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUrl
  );

  try {
    const credentials = await fs.readJson('./.googlerc')
    oauthClient.credentials.access_token = credentials.tokens.access_token;
    oauthClient.credentials.refresh_token = credentials.tokens.refresh_token;
    oauthClient.credentials.expiry_date = credentials.tokens.expiry_date;

    return oauthClient;

  } catch (e) {

    return new Promise((resolve, reject) => {
      // Generate the url that will be used for the consent dialog.
      const authorizeUrl = oauthClient.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
      });

      // Open an http server to accept the oauth callback. In this simple example, the
      // only request to our webserver is to /oauth2callback?code=<code>
      const server = http
        .createServer(async (req, res) => {
          try {
            if (req.url.indexOf('/oauth2callback') > -1) {
              // acquire the code from the querystring, and close the web server.
              const qs = new url.URL(req.url, 'http://localhost:3000')
                .searchParams;
              const code = qs.get('code');
              console.log(`Code is ${code}`);
              res.end('Authentication successful! Please return to the console.');
              server.destroy();

              // Now that we have the code, use that to acquire tokens.
              const r = await oauthClient.getToken(code);
              // Make sure to set the credentials on the OAuth2 client.
              oauthClient.setCredentials(r.tokens);
              console.info('Tokens acquired.');
              
              resolve(oauthClient);
            }
          } catch (e) {
            reject(e);
          }
        })
        .listen(3000, () => {
          // open the browser to the authorize url to start the workflow
          open(authorizeUrl, {wait: false}).then(cp => cp.unref());
        });

      destroyer(server);
    });
  }
}
