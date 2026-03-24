FROM eclipse-temurin:21-jre-alpine

RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY build/libs/*-SNAPSHOT.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]