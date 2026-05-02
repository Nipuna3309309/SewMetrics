#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <MPU6050.h>
#include <DHT.h>
#include <math.h>

#define HALL_PIN    27
#define STITCH_PIN  26
#define DHT_PIN     33
#define SDA_PIN     21
#define SCL_PIN     22

#define DHTTYPE DHT11
#define PULSES_PER_REV 2
#define STITCH_PULSES_PER_STITCH 2

const char* MACHINE_ID = "SM_01";

const char* ssid     = "SLT-Fiber-A3C4";
const char* password = "5CF@a3c4";

const char* mqtt_server = "0c6039121df445d2b7b2deea2bc8e94b.s1.eu.hivemq.cloud";
const int   mqtt_port   = 8883;
const char* mqtt_user   = "sewmetrics_user";
const char* mqtt_pass   = "Sew12345";
const char* mqtt_client_id = "SM_01_esp32";

const char* TOPIC_RPM         = "factory/machine/SM_01/rpm";
const char* TOPIC_STITCHES    = "factory/machine/SM_01/stitches";
const char* TOPIC_VIBRATION   = "factory/machine/SM_01/vibration";
const char* TOPIC_TEMPERATURE = "factory/machine/SM_01/temperature";

WiFiClientSecure espClient;
PubSubClient client(espClient);

MPU6050 mpu;
DHT dht(DHT_PIN, DHTTYPE);

const unsigned long LIVE_WINDOW_MS    = 5000UL;
const unsigned long MINUTE_WINDOW_MS  = 60000UL;
const unsigned long SPM_WINDOW_MS     = 5000UL;
const unsigned long DHT_INTERVAL_MS   = 2000UL;
const unsigned long VIB_INTERVAL_MS   = 200UL;
const unsigned long PRINT_MS          = 2000UL;
const unsigned long PUBLISH_MS        = 2000UL;

const unsigned long HALL_DEBOUNCE_US   = 3000UL;
const unsigned long STITCH_DEBOUNCE_US = 5000UL;

const unsigned long WIFI_RETRY_MS = 5000UL;
const unsigned long MQTT_RETRY_MS = 5000UL;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 10000UL;

const int MAX_BUFFERED_MESSAGES = 40;

struct BufferedMessage {
  String topic;
  String payload;
};

BufferedMessage messageBuffer[MAX_BUFFERED_MESSAGES];
int bufferHead = 0;
int bufferedMessageCount = 0;

unsigned long droppedBufferedMessages = 0;
unsigned long publishFailCount = 0;
unsigned long consecutivePublishFailures = 0;

unsigned long lastWiFiAttemptMs = 0;
unsigned long lastMQTTAttemptMs = 0;

volatile unsigned long totalPulseCount = 0;
volatile unsigned long lastHallUs = 0;

volatile unsigned long totalStitchCount = 0;
volatile unsigned long lastStitchUs = 0;

unsigned long lastLiveCalcMs = 0;
unsigned long lastMinuteCalcMs = 0;
unsigned long lastLivePulseSnapshot = 0;
unsigned long lastMinutePulseSnapshot = 0;
float liveRPM = 0.0;
float minuteRPM = 0.0;
bool minuteReady = false;

unsigned long lastSPMCalcMs = 0;
unsigned long lastStitchSnapshot = 0;
float stitchesPerMinute = 0.0;

unsigned long lastDHTMs = 0;
float temperatureC = NAN;
float humidity = NAN;

unsigned long lastVibrationMs = 0;
unsigned long vibrationRmsWindowStartMs = 0;
int16_t ax, ay, az;
float vibrationBaseline = 0.0;
float vibrationRaw = 0.0;
float vibrationStable = 0.0;
double vibrationSumSquares = 0.0;
unsigned long vibrationSampleCount = 0;

unsigned long lastPrintMs = 0;
unsigned long lastPublishMs = 0;

unsigned long rawPulsesToActualStitches(unsigned long rawPulses) {
  return rawPulses / STITCH_PULSES_PER_STITCH;
}

float rawPulsesToActualStitchesFloat(unsigned long rawPulses) {
  return rawPulses / (float)STITCH_PULSES_PER_STITCH;
}

bool networkReady() {
  return (WiFi.status() == WL_CONNECTED && client.connected());
}

void bufferMessage(const char* topic, const String& payload) {
  if (bufferedMessageCount >= MAX_BUFFERED_MESSAGES) {
    messageBuffer[bufferHead].topic = "";
    messageBuffer[bufferHead].payload = "";
    bufferHead = (bufferHead + 1) % MAX_BUFFERED_MESSAGES;
    bufferedMessageCount--;
    droppedBufferedMessages++;
    Serial.println("Buffer full. Oldest buffered message dropped.");
  }

  int insertIndex = (bufferHead + bufferedMessageCount) % MAX_BUFFERED_MESSAGES;
  messageBuffer[insertIndex].topic = String(topic);
  messageBuffer[insertIndex].payload = payload;
  bufferedMessageCount++;
}

void flushBufferedMessages() {
  if (!networkReady()) return;
  if (bufferedMessageCount == 0) return;

  Serial.print("Flushing buffered messages: ");
  Serial.println(bufferedMessageCount);

  while (bufferedMessageCount > 0 && networkReady()) {
    int idx = bufferHead;

    bool ok = client.publish(
      messageBuffer[idx].topic.c_str(),
      messageBuffer[idx].payload.c_str()
    );

    if (!ok) {
      publishFailCount++;
      consecutivePublishFailures++;
      Serial.println("Buffered publish failed. Flush paused.");
      break;
    }

    consecutivePublishFailures = 0;

    messageBuffer[idx].topic = "";
    messageBuffer[idx].payload = "";

    bufferHead = (bufferHead + 1) % MAX_BUFFERED_MESSAGES;
    bufferedMessageCount--;

    client.loop();
    delay(2);
  }
}

bool publishOrBuffer(const char* topic, const String& payload) {
  if (networkReady()) {
    bool ok = client.publish(topic, payload.c_str());
    if (ok) {
      consecutivePublishFailures = 0;
      return true;
    }
  }

  publishFailCount++;
  consecutivePublishFailures++;
  bufferMessage(topic, payload);
  return false;
}

void IRAM_ATTR hallISR() {
  unsigned long nowUs = micros();
  if (nowUs - lastHallUs > HALL_DEBOUNCE_US) {
    totalPulseCount++;
    lastHallUs = nowUs;
  }
}

void IRAM_ATTR stitchISR() {
  unsigned long nowUs = micros();
  if (nowUs - lastStitchUs > STITCH_DEBOUNCE_US) {
    totalStitchCount++;
    lastStitchUs = nowUs;
  }
}

void connectWiFi() {
  Serial.print("Connecting WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  lastWiFiAttemptMs = millis();

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Connected");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi not available now. Monitoring continues locally with buffering.");
  }
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastWiFiAttemptMs < WIFI_RETRY_MS) return;

  lastWiFiAttemptMs = now;

  Serial.println("WiFi lost. Reconnecting...");
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("Connecting MQTT... ");
  lastMQTTAttemptMs = millis();

  if (client.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
    Serial.println("Connected");
  } else {
    Serial.print("Failed rc = ");
    Serial.println(client.state());
    Serial.println("MQTT not available now. Data will stay buffered locally.");
  }
}

void ensureMQTT() {
  if (client.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastMQTTAttemptMs < MQTT_RETRY_MS) return;

  Serial.println("MQTT disconnected. Reconnecting...");
  connectMQTT();
}

void calibrateMPU() {
  Serial.println("Calibrating MPU6050... keep machine still.");

  double sumMagnitude = 0.0;
  const int samples = 200;

  for (int i = 0; i < samples; i++) {
    mpu.getAcceleration(&ax, &ay, &az);

    double M = sqrt(
      (double)ax * ax +
      (double)ay * ay +
      (double)az * az
    );

    sumMagnitude += M;
    delay(5);
  }

  vibrationBaseline = sumMagnitude / samples;

  Serial.print("Vibration Baseline (B): ");
  Serial.println(vibrationBaseline, 2);
  Serial.println("Calibration done.\n");
}

void updateLiveRPM(unsigned long now) {
  if (now - lastLiveCalcMs >= LIVE_WINDOW_MS) {
    noInterrupts();
    unsigned long pulsesNow = totalPulseCount;
    interrupts();

    unsigned long deltaPulses = pulsesNow - lastLivePulseSnapshot;
    unsigned long elapsedMs = now - lastLiveCalcMs;

    if (elapsedMs > 0) {
      liveRPM = (deltaPulses * 60000.0) / (elapsedMs * PULSES_PER_REV);
    }

    lastLivePulseSnapshot = pulsesNow;
    lastLiveCalcMs = now;
  }
}

void updateMinuteRPM(unsigned long now) {
  if (now - lastMinuteCalcMs >= MINUTE_WINDOW_MS) {
    noInterrupts();
    unsigned long pulsesNow = totalPulseCount;
    interrupts();

    unsigned long deltaPulses = pulsesNow - lastMinutePulseSnapshot;
    unsigned long elapsedMs = now - lastMinuteCalcMs;

    if (elapsedMs > 0) {
      minuteRPM = (deltaPulses * 60000.0) / (elapsedMs * PULSES_PER_REV);
      minuteReady = true;
    }

    lastMinutePulseSnapshot = pulsesNow;
    lastMinuteCalcMs = now;
  }
}

void updateSPM(unsigned long now) {
  if (now - lastSPMCalcMs >= SPM_WINDOW_MS) {
    noInterrupts();
    unsigned long stitchPulsesNow = totalStitchCount;
    interrupts();

    unsigned long deltaPulses = stitchPulsesNow - lastStitchSnapshot;
    unsigned long elapsedMs = now - lastSPMCalcMs;

    float actualDeltaStitches = rawPulsesToActualStitchesFloat(deltaPulses);

    if (elapsedMs > 0) {
      stitchesPerMinute = (actualDeltaStitches * 60000.0) / elapsedMs;
    }

    lastStitchSnapshot = stitchPulsesNow;
    lastSPMCalcMs = now;
  }
}

void updateDHT(unsigned long now) {
  if (now - lastDHTMs >= DHT_INTERVAL_MS) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
      humidity = h;
      temperatureC = t;
    }

    lastDHTMs = now;
  }
}

void updateVibration(unsigned long now) {
  if (now - lastVibrationMs >= VIB_INTERVAL_MS) {
    mpu.getAcceleration(&ax, &ay, &az);

    double M = sqrt(
      (double)ax * ax +
      (double)ay * ay +
      (double)az * az
    );

    double V = fabs(M - vibrationBaseline);

    vibrationRaw = (float)V;

    vibrationSumSquares += (V * V);
    vibrationSampleCount++;

    if (now - vibrationRmsWindowStartMs >= 1000UL) {
      if (vibrationSampleCount > 0) {
        vibrationStable = sqrt(vibrationSumSquares / vibrationSampleCount);
      }

      vibrationSumSquares = 0.0;
      vibrationSampleCount = 0;
      vibrationRmsWindowStartMs = now;
    }

    lastVibrationMs = now;
  }
}

String buildRpmJson(unsigned long now) {
  noInterrupts();
  unsigned long pulsesNow = totalPulseCount;
  interrupts();

  unsigned long currentMinutePulses = pulsesNow - lastMinutePulseSnapshot;
  float currentMinuteRevs = currentMinutePulses / (float)PULSES_PER_REV;
  float minuteProgressSec = (now - lastMinuteCalcMs) / 1000.0;

  String payload = "{";
  payload += "\"machine_id\":\"" + String(MACHINE_ID) + "\",";
  payload += "\"sensor\":\"rpm\",";
  payload += "\"wifi_connected\":";
  payload += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  payload += ",";
  payload += "\"mqtt_connected\":";
  payload += (client.connected() ? "true" : "false");
  payload += ",";
  payload += "\"time_ms\":" + String(now) + ",";
  payload += "\"rpm_live\":" + String(liveRPM, 2) + ",";
  payload += "\"rpm_1min\":";
  payload += minuteReady ? String(minuteRPM, 2) : "null";
  payload += ",";
  payload += "\"rpm_1min_ready\":";
  payload += minuteReady ? "true" : "false";
  payload += ",";
  payload += "\"minute_progress_sec\":" + String(minuteProgressSec, 1) + ",";
  payload += "\"current_minute_revs\":" + String(currentMinuteRevs, 2) + ",";
  payload += "\"buffered_messages\":" + String(bufferedMessageCount) + ",";
  payload += "\"dropped_buffered_messages\":" + String(droppedBufferedMessages) + ",";
  payload += "\"publish_fail_count\":" + String(publishFailCount) + ",";
  payload += "\"consecutive_publish_failures\":" + String(consecutivePublishFailures);
  payload += "}";
  return payload;
}

String buildStitchesJson(unsigned long now) {
  noInterrupts();
  unsigned long stitchPulsesNow = totalStitchCount;
  interrupts();

  unsigned long actualStitches = rawPulsesToActualStitches(stitchPulsesNow);

  String payload = "{";
  payload += "\"machine_id\":\"" + String(MACHINE_ID) + "\",";
  payload += "\"sensor\":\"stitches\",";
  payload += "\"wifi_connected\":";
  payload += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  payload += ",";
  payload += "\"mqtt_connected\":";
  payload += (client.connected() ? "true" : "false");
  payload += ",";
  payload += "\"time_ms\":" + String(now) + ",";
  payload += "\"stitches_total\":" + String(actualStitches) + ",";
  payload += "\"spm\":" + String(stitchesPerMinute, 2) + ",";
  payload += "\"buffered_messages\":" + String(bufferedMessageCount) + ",";
  payload += "\"dropped_buffered_messages\":" + String(droppedBufferedMessages) + ",";
  payload += "\"publish_fail_count\":" + String(publishFailCount) + ",";
  payload += "\"consecutive_publish_failures\":" + String(consecutivePublishFailures);
  payload += "}";
  return payload;
}

String buildVibrationJson(unsigned long now) {
  String payload = "{";
  payload += "\"machine_id\":\"" + String(MACHINE_ID) + "\",";
  payload += "\"sensor\":\"vibration\",";
  payload += "\"wifi_connected\":";
  payload += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  payload += ",";
  payload += "\"mqtt_connected\":";
  payload += (client.connected() ? "true" : "false");
  payload += ",";
  payload += "\"time_ms\":" + String(now) + ",";
  payload += "\"accel_x\":" + String(ax) + ",";
  payload += "\"accel_y\":" + String(ay) + ",";
  payload += "\"accel_z\":" + String(az) + ",";
  payload += "\"vibration_raw\":" + String(vibrationRaw, 2) + ",";
  payload += "\"vibration_stable\":" + String(vibrationStable, 2) + ",";
  payload += "\"buffered_messages\":" + String(bufferedMessageCount) + ",";
  payload += "\"dropped_buffered_messages\":" + String(droppedBufferedMessages) + ",";
  payload += "\"publish_fail_count\":" + String(publishFailCount) + ",";
  payload += "\"consecutive_publish_failures\":" + String(consecutivePublishFailures);
  payload += "}";
  return payload;
}

String buildTemperatureJson(unsigned long now) {
  String payload = "{";
  payload += "\"machine_id\":\"" + String(MACHINE_ID) + "\",";
  payload += "\"sensor\":\"temperature\",";
  payload += "\"wifi_connected\":";
  payload += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  payload += ",";
  payload += "\"mqtt_connected\":";
  payload += (client.connected() ? "true" : "false");
  payload += ",";
  payload += "\"time_ms\":" + String(now) + ",";
  payload += "\"temperature_c\":";
  payload += isnan(temperatureC) ? "null" : String(temperatureC, 2);
  payload += ",";
  payload += "\"humidity\":";
  payload += isnan(humidity) ? "null" : String(humidity, 2);
  payload += ",";
  payload += "\"buffered_messages\":" + String(bufferedMessageCount) + ",";
  payload += "\"dropped_buffered_messages\":" + String(droppedBufferedMessages) + ",";
  payload += "\"publish_fail_count\":" + String(publishFailCount) + ",";
  payload += "\"consecutive_publish_failures\":" + String(consecutivePublishFailures);
  payload += "}";
  return payload;
}

void printStatus(unsigned long now) {
  if (now - lastPrintMs >= PRINT_MS) {
    noInterrupts();
    unsigned long stitchPulsesNow = totalStitchCount;
    interrupts();

    unsigned long actualStitches = rawPulsesToActualStitches(stitchPulsesNow);

    Serial.println("------------------------------------------------");
    Serial.print("WiFi Connected      : ");
    Serial.println(WiFi.status() == WL_CONNECTED ? "YES" : "NO");

    Serial.print("MQTT Connected      : ");
    Serial.println(client.connected() ? "YES" : "NO");

    Serial.print("Live RPM            : ");
    Serial.println(liveRPM, 2);

    Serial.print("1-Min RPM           : ");
    if (minuteReady) Serial.println(minuteRPM, 2);
    else Serial.println("Calculating...");

    Serial.print("Stitches Total      : ");
    Serial.println(actualStitches);

    Serial.print("SPM                 : ");
    Serial.println(stitchesPerMinute, 2);

    Serial.print("Temperature (C)     : ");
    if (isnan(temperatureC)) Serial.println("null");
    else Serial.println(temperatureC, 2);

    Serial.print("Humidity (%)        : ");
    if (isnan(humidity)) Serial.println("null");
    else Serial.println(humidity, 2);

    Serial.print("Vibration Raw       : ");
    Serial.println(vibrationRaw, 2);

    Serial.print("Vibration Stable    : ");
    Serial.println(vibrationStable, 2);

    Serial.print("Buffered Messages   : ");
    Serial.println(bufferedMessageCount);

    Serial.print("Dropped Buffered    : ");
    Serial.println(droppedBufferedMessages);

    Serial.print("Publish Fail Count  : ");
    Serial.println(publishFailCount);

    Serial.print("Consecutive Fails   : ");
    Serial.println(consecutivePublishFailures);

    lastPrintMs = now;
  }
}

void publishAllTopics(unsigned long now) {
  if (now - lastPublishMs < PUBLISH_MS) return;

  if (client.connected()) {
    client.loop();
  }

  flushBufferedMessages();

  String rpmPayload = buildRpmJson(now);
  String stitchesPayload = buildStitchesJson(now);
  String vibrationPayload = buildVibrationJson(now);
  String temperaturePayload = buildTemperatureJson(now);

  bool ok1 = publishOrBuffer(TOPIC_RPM, rpmPayload);
  bool ok2 = publishOrBuffer(TOPIC_STITCHES, stitchesPayload);
  bool ok3 = publishOrBuffer(TOPIC_VIBRATION, vibrationPayload);
  bool ok4 = publishOrBuffer(TOPIC_TEMPERATURE, temperaturePayload);

  Serial.println("Published RPM JSON:");
  Serial.println(rpmPayload);
  Serial.println("Published Stitches JSON:");
  Serial.println(stitchesPayload);
  Serial.println("Published Vibration JSON:");
  Serial.println(vibrationPayload);
  Serial.println("Published Temperature JSON:");
  Serial.println(temperaturePayload);

  Serial.print("Publish RPM         : ");
  Serial.println(ok1 ? "OK" : "BUFFERED");
  Serial.print("Publish Stitches    : ");
  Serial.println(ok2 ? "OK" : "BUFFERED");
  Serial.print("Publish Vibration   : ");
  Serial.println(ok3 ? "OK" : "BUFFERED");
  Serial.print("Publish Temperature : ");
  Serial.println(ok4 ? "OK" : "BUFFERED");

  lastPublishMs = now;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("==============================================");
  Serial.println("SewMetrics - Full ESP32 MQTT Project");
  Serial.println("==============================================");

  pinMode(HALL_PIN, INPUT_PULLUP);
  pinMode(STITCH_PIN, INPUT_PULLUP);

  attachInterrupt(digitalPinToInterrupt(HALL_PIN), hallISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(STITCH_PIN), stitchISR, FALLING);

  dht.begin();

  Wire.begin(SDA_PIN, SCL_PIN);
  mpu.initialize();

  if (mpu.testConnection()) Serial.println("MPU6050 connected");
  else Serial.println("MPU6050 connection failed");

  calibrateMPU();

  connectWiFi();

  espClient.setInsecure();
  client.setServer(mqtt_server, mqtt_port);
  client.setBufferSize(512);

  connectMQTT();

  unsigned long now = millis();
  lastLiveCalcMs = now;
  lastMinuteCalcMs = now;
  lastSPMCalcMs = now;
  lastDHTMs = now;
  lastVibrationMs = now;
  vibrationRmsWindowStartMs = now;
  lastPrintMs = now;
  lastPublishMs = now;
}

void loop() {
  unsigned long now = millis();

  ensureWiFi();
  ensureMQTT();

  if (client.connected()) {
    client.loop();
  }

  updateLiveRPM(now);
  updateMinuteRPM(now);
  updateSPM(now);
  updateDHT(now);
  updateVibration(now);

  printStatus(now);
  publishAllTopics(now);
}