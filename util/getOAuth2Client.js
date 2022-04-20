const { OAuth2Client } = require('google-auth-library');
const http = require('http');
const url = require('url');
const open = require('open');
const fs = require('fs-extra');
const destroyer = require('server-destroy');
const inquirer = require('inquirer');
//const Filenames = require('../data/Filenames');

module.exports = async function getOAuth2Client(credentials) {
  // let data = {
  //   clientId: credentials.web.client_id,
  //   clientSecret: credentials.web.client_secret
  // };

  try {

    const oauthClient = new OAuth2Client({
      clientId: credentials.web.client_id,
      clientSecret: credentials.web.client_secret,
    });

    oauthClient.credentials.access_token = credentials.tokens.access_token;
    oauthClient.credentials.refresh_token = credentials.tokens.refresh_token;
    oauthClient.credentials.expiry_date = credentials.tokens.expiry_date;

    return oauthClient;

  } catch (e) {

    console.log(e);

    // const { clientId } = await inquirer.prompt({
    //   type: 'input',
    //   name: 'clientId',
    //   message: 'Client ID?',
    //   default: process.env.displayMonks_clientId,
    // });
    //
    // const { clientSecret } = await inquirer.prompt({
    //   type: 'input',
    //   name: 'clientSecret',
    //   message: 'Client Secret?',
    //   default: process.env.displayMonks_clientSecret,
    // });

    // data = {
    //   clientId, clientSecret
    // }

    return new Promise((resolve, reject) => {

      // create an oAuth client to authorize the API call.  Secrets are kept in a `keys.json` file,
      // which should be downloaded from the Google Developers Console.
      const oAuth2Client = new OAuth2Client(
          credentials.web.client_id,
          credentials.web.client_secret,
          "http://localhost:3000/oauth2callback"
      );

      // Generate the url that will be used for the consent dialog.
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/presentations',
          'https://www.googleapis.com/auth/drive'
        ]
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
              const r = await oAuth2Client.getToken(code);
              // Make sure to set the credentials on the OAuth2 client.
              oAuth2Client.setCredentials(r.tokens);
              console.info('Tokens acquired.');

              credentials.tokens = {};
              credentials.tokens.access_token = oAuth2Client.credentials.access_token;
              credentials.tokens.refresh_token = oAuth2Client.credentials.refresh_token;
              credentials.tokens.expiry_date = oAuth2Client.credentials.expiry_date;
              await fs.writeJson('./creds/credentials.json', credentials);

              resolve(oAuth2Client);
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
