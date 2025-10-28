FROM node:22-bookworm
LABEL version="1.0" maintainer="Espen Hovlandsdal <espen@hovlandsdal.com>"

WORKDIR /srv/app

# Install app dependencies (pre-source copy in order to cache dependencies)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Bundle app source
COPY . .

RUN npx -y playwright install --with-deps
RUN npx -y playwright install

CMD [ "node", "cron.js" ]
