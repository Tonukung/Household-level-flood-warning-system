#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFiS3.h>
#include <PubSubClient.h>
#include "secrets.h"

// MQ-135
const int MQ135_AOUT = A0;  // Read Analog
const int MQ135_DOUT = 3;   // Read Digital from Comparator

// HC-SR04 Ultrasonic
const int TRIG_PIN = 5;     
const int ECHO_PIN = 6;     

LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

const float CONTAINER_HEIGHT_CM = 15.0;

const float WATER_THRESHOLD_CM = 2.0;

int gasADC = 0;             // Analog from MQ-135
int gasDigital = HIGH;      // Digital from MQ-135

float distanceCm = 0.0;
float waterLevelCm = 0.0;

bool waterDetected = false; // examination water detected
bool gasAnomaly = false;    // Anomaly ?
bool distanceOK = false;

unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastSample = 0;
bool wifiStarted = false;

const unsigned long SAMPLE_INTERVAL_MS = 1000;
const unsigned long RECONNECT_INTERVAL_MS = 5000;

// ==========================================
// Ultrasonic
// ==========================================

bool readDistance(float &distance) {

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(
    ECHO_PIN,
    HIGH,
    25000
  );

  if (duration == 0) {
    return false;
  }

  distance = duration * 0.0343 / 2.0;

  if (distance < 2.0 || distance > 400.0) {
    return false;
  }

  return true;
}

// ==========================================
// MQ-135
// ==========================================

int readGasAverage() {

  const int SAMPLE_COUNT = 10;
  long total = 0;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    total += analogRead(MQ135_AOUT);
    delay(5);
  }

  return total / SAMPLE_COUNT;
}

// ==========================================
// MQTT
// ==========================================

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (!wifiStarted || millis() - lastWifiAttempt >= 10000) {
    lastWifiAttempt = millis();
    wifiStarted = true;
    Serial.println("Connecting to Wi-Fi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

void maintainMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (millis() - lastMqttAttempt < RECONNECT_INTERVAL_MS) {
    return;
  }

  lastMqttAttempt = millis();
  Serial.print("Connecting to MQTT... ");
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println("connected");
  } else {
    Serial.print("failed, state=");
    Serial.println(mqttClient.state());
  }
}

void publishTelemetry() {
  if (!mqttClient.connected()) {
    return;
  }

  char levelText[16] = "null";
  char distanceText[16] = "null";
  if (distanceOK) {
    dtostrf(waterLevelCm, 1, 1, levelText);
    dtostrf(distanceCm, 1, 1, distanceText);
  }

  char payload[256];
  snprintf(
    payload,
    sizeof(payload),
    "{\"stationId\":\"%s\",\"waterLevelCm\":%s,\"distanceCm\":%s,"
    "\"gasAdc\":%d,\"gasDigital\":\"%s\",\"waterDetected\":%s,"
    "\"gasAnomaly\":%s,\"distanceValid\":%s}",
    MQTT_STATION_ID,
    levelText,
    distanceText,
    gasADC,
    gasDigital == LOW ? "LOW" : "HIGH",
    waterDetected ? "true" : "false",
    gasAnomaly ? "true" : "false",
    distanceOK ? "true" : "false"
  );

  if (!mqttClient.publish(MQTT_TOPIC, payload)) {
    Serial.println("MQTT publish failed");
  }
}

// ==========================================
// LCD
// ==========================================

void updateLCD() {

  lcd.setCursor(0, 0);

  if (waterDetected) {
    lcd.print("Water:");
    lcd.print(waterLevelCm, 1);
    lcd.print(" cm   ");
  } else {
    lcd.print("Water: No water");
  }

  lcd.setCursor(0, 1);

  if (!waterDetected) {
    lcd.print("Gas: Standby    ");
  } else if (gasAnomaly) {
    lcd.print("Gas: Anomaly!   ");
  } else {
    lcd.print("Gas:");
    lcd.print(gasADC);
    lcd.print(" ");
    lcd.print(gasDigital == LOW ? "LOW " : "HIGH");
  }
}

// ==========================================
// System
// ==========================================

void setup() {

  Serial.begin(115200);

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(384);

  pinMode(MQ135_AOUT, INPUT);
  pinMode(MQ135_DOUT, INPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Wire.begin();

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Water & Gas");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  delay(1000);

  Serial.println("Water & Gas Monitor Started");
  Serial.println("----------------------------");
  maintainWiFi();
}

// ==========================================
// Main Loop
// ==========================================

void loop() {
  maintainWiFi();
  maintainMQTT();
  mqttClient.loop();

  if (millis() - lastSample < SAMPLE_INTERVAL_MS) {
    return;
  }
  lastSample = millis();

  gasADC = readGasAverage();
  gasDigital = digitalRead(MQ135_DOUT);

  // ------------------------------------------
  // Calculate
  // ------------------------------------------

  distanceOK = readDistance(distanceCm);

  if (distanceOK) {

    waterLevelCm = CONTAINER_HEIGHT_CM - distanceCm;

    if (waterLevelCm < 0.0) {
      waterLevelCm = 0.0;
    }

    waterDetected = (
      waterLevelCm >= WATER_THRESHOLD_CM
    );

  } else {

    waterDetected = false;
    waterLevelCm = 0.0;
  }

  // ------------------------------------------
  // GAS Examination
  // ------------------------------------------

  if (waterDetected) {
    gasAnomaly = (gasDigital == LOW);
  } else {
    gasAnomaly = false;
  }

  updateLCD();

  // ------------------------------------------
  // Print Serial Monitor
  // ------------------------------------------

  Serial.print("Gas ADC Average: ");
  Serial.print(gasADC);

  Serial.print(" | Gas DOUT: ");
  Serial.print(gasDigital == LOW ? "LOW" : "HIGH");

  Serial.print(" | Distance: ");
  if (distanceOK) {
    Serial.print(distanceCm, 1);
    Serial.print(" cm");
  } else {
    Serial.print("ERROR");
  }

  Serial.print(" | Water Level: ");
  Serial.print(waterLevelCm, 1);
  Serial.print(" cm");

  Serial.print(" | Water Detected: ");
  Serial.print(waterDetected ? "YES" : "NO");

  Serial.print(" | Gas Anomaly: ");
  Serial.println(gasAnomaly ? "YES" : "NO");

  publishTelemetry();
}
