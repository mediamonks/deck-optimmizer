# Media.Monks Deck Optimmizer
Node.js server application that downloads, optimizes and replaces all GIF files in a given Google Slides presentation.

## Installation
Clone this repo to a folder of your choice and install the dependencies.

## Basic usage
`npm start`

You will need to provide some credentials:
- Google 
  - Service Alias Email
  - Private Key
- AWS
  - Key
  - Secret
  - Bucket

Which are saved in a local file for future use.

# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [To do]

## [0.2] - 2022-05-10
### Added

- Support for 'weird' crops, like circles or even arrows
- Automatic resizing of images that have are scaled to less than 95%


## [0.11] - 2022-04-26
### Added
- App now runs on [server] with a simple front end
- Big performance increase by making tasks run parallel instead of sequentially:
  - looping through slide, looking for GIF files 
  - optimizing GIF files
  - uploading and replacing URLs 
- Users can now fill in the URL to the slides, instead of the ID
- Support for cropped GIFs

## [0.1] - 2022-04-20
### Added
- Proof of concept working, very high level blanket approach to optimizing images (everything same settings)

[To do]: https://github.com/mediamonks/deck-optimmizer/issues
[0.2]: https://github.com/mediamonks/deck-optimmizer/releases/tag/0.2
[0.11]: https://github.com/mediamonks/deck-optimmizer/releases/tag/0.11
[0.1]: https://github.com/mediamonks/deck-optimmizer/releases/tag/0.1
[server]: https://deck-optimmizer.eu.dev.monkapps.com/