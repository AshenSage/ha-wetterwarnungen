# v1.0.1

- Fehler «CAP-Daten konnten nicht ausgewertet werden» behoben: der von Home Assistant nicht unterstützte Template-Filter `regex_escape` wird nicht mehr verwendet. Regionsnamen werden im Frontend sicher als literaler Suchtext vorbereitet.
- CAP-Discovery wird mit Home Assistants unveränderlicher Jinja-Sandbox und ausschliesslich unterstützten Filtern getestet. Der Fehler aus v1.0.0 wird vom Regressionstest erkannt.
- Bei einem Template-Fehler lässt sich die konkrete Home-Assistant-Fehlermeldung unter «Fehlerdetails» aufklappen.
- Bestehende Karten-YAML kann unverändert weiterverwendet werden.

## v1.0.0

- Kompakte Statuskarte nach Variante 1 mit grossen Statussymbolen und dezentem Abrufzeitpunkt.
- Wetterwarnungen mit Stufe, Zeitraum und wetterbezogenem Symbol.
- Vollständige Beschreibungen, Handlungsempfehlungen und Datenstatus unter «Details».
- Erkennt vorhandene CAP-Alerts-Geräte und Sensoren; keine geratenen Detail-Entitäten.
- Veraltete, unvollständige und unbestätigte Daten erscheinen als unbekannte Warnlage.
- Wiederverbindung, mobile Darstellung, Theme-Unterstützung und grafischer Karteneditor.
- HACS-Dashboard-Repository; einzelne JS-Datei ohne zusätzliche Frontend-Abhängigkeiten.
