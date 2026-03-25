FROM eclipse-temurin:21-jre-alpine

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache expat>=2.7.5

WORKDIR /app

COPY build/libs/*-SNAPSHOT.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
