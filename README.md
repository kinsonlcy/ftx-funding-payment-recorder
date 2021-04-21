# ftx-funding-payment-recorder

A simple script to record funding payments from FTX

## Steps to use

1. Copy a .env file from .env.example

2. Get and fill your API secret and API key from FTX (Recommended to create a read-only API key)

3. Get and fill your Google Service account email and private key from Google Cloud Console

4. Enable Google Sheets API in your Google Cloud Console

5. Create a Google spreadsheet and grant edit right to your service account email

6. For quick start, run yarn && yarn start

7. Done!

## Arguments

You can also get previous funding payments through passing arguments. For example:

```
 yarn start [-y|--year] 2020 [-m|--month] 8 [-s|--subAccount] hello
```

## License

MIT
