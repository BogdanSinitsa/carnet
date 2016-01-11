##Endpoints

**http://zecarnet.eu-gb.mybluemix.net/create-account** - POST

* params: 
    - deviceID
    - email
    - make
    - model

**http://zecarnet.eu-gb.mybluemix.net/update-location** - PUT

* params:
    - deviceID
    - lon
    - lat

**http://zecarnet.eu-gb.mybluemix.net/[like|dislike]** - POST

* params:
    - currDeviceID
    - carDeviceID

**http://zecarnet.eu-gb.mybluemix.net/message** - POST

* params: 
    - currDeviceID
    - carDeviceID
    - text