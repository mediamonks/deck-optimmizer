
<div id="top"></div>

<!-- PROJECT SHIELDS -->
<!--
*** Using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project
The purpose of this tool is to optimize GIF files within Google Slides to reduce the deck file size and improve loading time.

From a technical standpoint it's a Node.js server application that makes a copy of the Google Slides Presentation, downloads all it's GIFs, optimizes them with Gifsicle, hosts the GIFs in an s3 bucket, replaces the optimized GIFs in the presentation and transfers ownership to the user.



<p align="right">(<a href="#top">back to top</a>)</p>



### Built With

 [![Node.js]][Node-url]
[![Gifsicle]][Gifsicle-url]


<p align="right">(<a href="#top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started


### Prerequisites
A `creds.json` file with access credentials for a Google service account, AWS, and Workato. 



### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/mediamonks/deck-optimmizer
   ```
2. Install NPM packages
   ```sh
   npm install
   ```
3. Enter your API credentials in `creds.js`
```
    {
    "google":{
    	"client_email":"YOUR_CLIENT_EMAIL",
    	"client_id":"YOUR_CLIENT_ID",
    	"private_key":"YOUR_PRIVATE_KEY"
    	},
    "aws":{
    	"accessKeyId":"YOUR_ACCESS_KEY_ID",
	   	"secretAccessKey":"YOUR_SECRET_ACCESS_KEY",
    	"bucket":"YOUR_BUCKET_ID"
    	},
    "workato":{
    	"client_id":"YOUR_CLIENT_ID",
    	"client_secret":"YOUR_CLIENT_SECRET",
    	"access_key":"YOUR_ACCESS_KEY"
    	}
    }
```
 4. Start the Node.Js webserver
```
    node src/index.js 
```

<p align="right">(<a href="#top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. 

<p align="right">(<a href="#top">back to top</a>)</p>


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#top">back to top</a>)</p>




<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[Node.js]: https://img.shields.io/badge/N-Node.Js-green
[Node-url]: https://nodejs.org/en/
[Gifsicle]: https://img.shields.io/badge/G-Gifsicle-green
[Gifsicle-url]: https://www.lcdf.org/gifsicle/
[Repo-url]:https://github.com/mediamonks/deck-optimmizer