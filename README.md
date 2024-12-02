# Account anlytics

That worker is highly inspired by the following project from the Cloudflare dev doc [here](https://developers.cloudflare.com/workers/tutorials/automated-analytics-reporting/).

## What the worker is doing?

The workers are doing two things:  
-  Retrieving all the accounts and zones from the API token and providing analytics on request and bandwidth consumption for each account and zone.  
-  Sending an email with those analytics.

## API token needed

Here are the rights needed for the workers to run successfully:
- All accounts - Account Analytics:Read
- All zones - Analytics:Read
- All users - Memberships:Edit

## How to run?

See section [test the worker](https://developers.cloudflare.com/workers/tutorials/automated-analytics-reporting/#4-test-the-worker)

```
npx wrangler deploy
```

```
npx wrangler secret put <secret
```

The email scheduler is using the `CF_ACCOUNT_ID`, the GET when visiting the endpoint just use the scope of the APi token to get all the accounts and all zones associated. 

To use the scheduler, do not forget to change the var section in the wrangler.toml
```
[vars]
# This value shows the name of the sender in the email
SENDER_NAME = "Cloudflare Analytics Worker"

# This email address will be used as the sender of the email
SENDER_EMAIL = "<EMAIL>"

# This email address will be used as the recipient of the email
RECIPIENT_EMAIL = "<EMAIL>"

# This value will be used as the subject of the email
EMAIL_SUBJECT = "Cloudflare Analytics Report"
```