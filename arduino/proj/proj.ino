#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFiS3.h>
#include <MQTT.h>
#include "secrets.h"

// ตัวแจ้งเตือนเสียง (Active Buzzer / Relay)
const int BUZZER_PIN = 2;   

// MQ-135
const int MQ135_AOUT = A0;  
const int MQ135_DOUT = 3;   

// HC-SR04 Ultrasonic
const int TRIG_PIN = 5;     
const int ECHO_PIN = 6;     

LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient wifiClient;

// กำหนด Buffer size เป็น 512 bytes
MQTTClient mqttClient(512); 

// ==========================================
// ตั้งค่าระดับ Threshold ต่างๆ
// ==========================================
const float CONTAINER_HEIGHT_CM = 17.0; // ความสูงแก้วทั้งหมด
const float WATER_THRESHOLD_CM  = 2.0;  // ระดับน้ำเริ่มต้นที่จะให้จอแสดงผล 
const float WATER_ALARM_CM      = 8.0;  // ระดับน้ำที่จะเริ่ม "กระพริบเตือนและร้องเตือน" 

int gasADC = 0;             
int gasDigital = HIGH;      

float distanceCm = 0.0;
float waterLevelCm = 0.0;

bool waterDetected = false; 
bool gasAnomaly = false;    
bool distanceOK = false;

// ตัวแปรควบคุมสถานะ Mute / Resume
bool isMuted = false;

// ตัวแปรสำหรับจัดการเวลา (Timer)
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastSample = 0;
unsigned long lastLcdUpdate = 0; 
bool wifiStarted = false;
bool blinkState = true;     

const unsigned long SAMPLE_INTERVAL_MS = 1000;
const unsigned long RECONNECT_INTERVAL_MS = 5000;
const unsigned long LCD_BLINK_INTERVAL_MS = 1000; 

// ==========================================
// จังหวะเสียง Buzzer แบบ Patient Monitor (HIGH / LOW)
// ==========================================
const int BUZZER_PATTERN_TIMINGS[] = {150, 100, 150, 100, 150, 800}; 
const int BUZZER_PATTERN_LENGTH = 6;

bool lastAlarmState = false;
unsigned long previousBuzzerMillis = 0;
int buzzerStep = 0;

// ==========================================
// แฮ็กจอ LCD: สร้างฟอนต์ตัวเลขแบบ Highlight (แถบทึบ)
// ==========================================
const uint8_t invFont[11][8] = {
  {0x11, 0x0E, 0x0C, 0x0A, 0x06, 0x0E, 0x11, 0x1F}, // 0
  {0x1B, 0x13, 0x1B, 0x1B, 0x1B, 0x1B, 0x11, 0x1F}, // 1
  {0x11, 0x0E, 0x1E, 0x1D, 0x1B, 0x17, 0x00, 0x1F}, // 2
  {0x11, 0x0E, 0x1E, 0x19, 0x1E, 0x0E, 0x11, 0x1F}, // 3
  {0x1D, 0x19, 0x15, 0x0D, 0x00, 0x1D, 0x1D, 0x1F}, // 4
  {0x00, 0x0F, 0x01, 0x1E, 0x1E, 0x0E, 0x11, 0x1F}, // 5
  {0x19, 0x17, 0x0F, 0x01, 0x0E, 0x0E, 0x11, 0x1F}, // 6
  {0x00, 0x1E, 0x1D, 0x1B, 0x17, 0x17, 0x17, 0x1F}, // 7
  {0x11, 0x0E, 0x0E, 0x11, 0x0E, 0x0E, 0x11, 0x1F}, // 8
  {0x11, 0x0E, 0x0E, 0x10, 0x1E, 0x1D, 0x13, 0x1F}, // 9
  {0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x13, 0x13, 0x1F}  // . (จุดทศนิยม)
};

void printHighlight(String text, int col, int row, byte startSlot) {
  for(int i = 0; i < text.length(); i++) {
    char c = text[i];
    byte slot = startSlot + i;
    if(slot > 7) continue; 
    if(c >= '0' && c <= '9') {
      lcd.createChar(slot, (uint8_t*)invFont[c - '0']);
    } else if (c == '.') {
      lcd.createChar(slot, (uint8_t*)invFont[10]);
    }
  }
  
  lcd.setCursor(col, row);
  for(int i = 0; i < text.length(); i++) {
    char c = text[i];
    byte slot = startSlot + i;
    if((c >= '0' && c <= '9') || c == '.') {
      if(slot <= 7) lcd.write(slot);
    } else {
      lcd.print(c);
    }
  }
}

// ==========================================
// Ultrasonic
// ==========================================

bool readDistance(float &distance) {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  if (duration == 0) return false;

  distance = duration * 0.0343 / 2.0;
  if (distance < 2.0 || distance > 400.0) return false;
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
  if (WiFi.status() == WL_CONNECTED) return;

  if (!wifiStarted || millis() - lastWifiAttempt >= 10000) {
    lastWifiAttempt = millis();
    wifiStarted = true;
    Serial.println("Connecting to Wi-Fi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

void maintainMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) return;

  if (millis() - lastMqttAttempt < RECONNECT_INTERVAL_MS) return;

  lastMqttAttempt = millis();
  Serial.print("Connecting to MQTT... ");
  
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println("connected");
  } else {
    Serial.print("failed, return code = ");
    Serial.println(mqttClient.lastError());
  }
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

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
    "\"gasAnomaly\":%s,\"distanceValid\":%s,\"isMuted\":%s}",
    MQTT_STATION_ID,
    levelText,
    distanceText,
    gasADC,
    gasDigital == LOW ? "LOW" : "HIGH",
    waterDetected ? "true" : "false",
    gasAnomaly ? "true" : "false",
    distanceOK ? "true" : "false",
    isMuted ? "true" : "false"
  );

  if (!mqttClient.publish(MQTT_TOPIC, payload)) {
    Serial.println("MQTT publish failed");
  }
}

// ==========================================
// LCD Update 
// ==========================================

void updateLCD() {
  // บรรทัดที่ 1 (Water)
  lcd.setCursor(0, 0);
  if (waterDetected) {
    lcd.print("Water: "); 
    String wStr = String(waterLevelCm, 1);
    
    if (waterLevelCm >= WATER_ALARM_CM && blinkState && !isMuted) {
      printHighlight(wStr, 7, 0, 0); 
    } else {
      lcd.setCursor(7, 0);           
      lcd.print(wStr);
    }
    lcd.print(" cm  "); 
  } else {
    lcd.print("Water: No water ");
  }

  // บรรทัดที่ 2 (Gas)
  lcd.setCursor(0, 1);
  if (!waterDetected) {
    lcd.print("Gas: Standby    ");
  } else {
    lcd.print("Gas: ");
    String gStr = String(gasADC);
    
    if (gasAnomaly && blinkState && !isMuted) {
      printHighlight(gStr, 5, 1, 4); 
    } else {
      lcd.setCursor(5, 1);
      lcd.print(gStr);
    }
    lcd.print("        "); 
  }
}

// ==========================================
// System Setup
// ==========================================

void setup() {
  Serial.begin(115200);
  
  mqttClient.begin(MQTT_BROKER, MQTT_PORT, wifiClient);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH); 

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
  Serial.println("Type 'mute' or 'resume' in Serial Monitor.");
  maintainWiFi();
}

// ==========================================
// Main Loop
// ==========================================

void loop() {
  maintainWiFi();
  maintainMQTT();
  mqttClient.loop();

  // ตรวจสอบ Serial Monitor เพื่อรับคำสั่ง Mute / Resume
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.equalsIgnoreCase("mute") || cmd.equalsIgnoreCase("off")) {
      isMuted = true;
      digitalWrite(BUZZER_PIN, HIGH);
      Serial.println(">> [SERIAL COMMAND] System MUTED.");
    } else if (cmd.equalsIgnoreCase("resume") || cmd.equalsIgnoreCase("on")) {
      isMuted = false;
      Serial.println(">> [SERIAL COMMAND] System RESUMED.");
    }
  }

  // ------------------------------------------
  // ควบคุมเสียง Buzzer (ทำงานเฉพาะเมื่อไม่ได้ถูก Mute)
  // ------------------------------------------
  bool isAlarmActive = ((waterLevelCm >= WATER_ALARM_CM) || gasAnomaly) && !isMuted;

  if (isAlarmActive) {
    if (!lastAlarmState) {
      buzzerStep = 0;
      previousBuzzerMillis = millis();
      digitalWrite(BUZZER_PIN, LOW); 
    } else {
      if (millis() - previousBuzzerMillis >= BUZZER_PATTERN_TIMINGS[buzzerStep]) {
        previousBuzzerMillis = millis();
        buzzerStep = (buzzerStep + 1) % BUZZER_PATTERN_LENGTH;
        
        if (buzzerStep % 2 == 0) {
          digitalWrite(BUZZER_PIN, LOW);  
        } else {
          digitalWrite(BUZZER_PIN, HIGH); 
        }
      }
    }
  } else {
    digitalWrite(BUZZER_PIN, HIGH); 
  }
  lastAlarmState = isAlarmActive;

  // ------------------------------------------
  // ควบคุมจอ LCD กระพริบ
  // ------------------------------------------
  if (millis() - lastLcdUpdate >= LCD_BLINK_INTERVAL_MS) {
    lastLcdUpdate = millis();
    blinkState = !blinkState; 
    updateLCD();
  }

  // ------------------------------------------
  // อ่านค่าเซนเซอร์และการส่ง MQTT (ทุก 1 วิ)
  // ------------------------------------------
  if (millis() - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = millis();

    gasADC = readGasAverage();
    gasDigital = digitalRead(MQ135_DOUT);

    distanceOK = readDistance(distanceCm);

    if (distanceOK) {
      waterLevelCm = CONTAINER_HEIGHT_CM - distanceCm;
      if (waterLevelCm < 0.0) waterLevelCm = 0.0;
      waterDetected = (waterLevelCm >= WATER_THRESHOLD_CM);
    } else {
      waterDetected = false;
      waterLevelCm = 0.0;
    }

    if (waterDetected) {
      gasAnomaly = (gasDigital == LOW); 
    } else {
      gasAnomaly = false;
    }

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
    Serial.print(gasAnomaly ? "YES" : "NO");
    Serial.print(" | Muted: ");
    Serial.println(isMuted ? "YES" : "NO");

    publishTelemetry();
  }
}