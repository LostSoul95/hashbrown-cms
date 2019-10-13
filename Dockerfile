# The docker image to be send onto the container registry.
# Non traditional approach for Node.js Build



FROM node:10

ADD package.json /tmp/package.json

RUN cd /tmp && npm install

RUN mkdir -p /usr/src/app && cp -a /tmp/node_modules /usr/src/app/

WORKDIR /usr/src/app

COPY . /usr/src/app/

CMD [ "npm", "start" ]

EXPOSE 4000