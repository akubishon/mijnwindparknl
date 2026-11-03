Attribute VB_Name = "OpsplitsingWerkblad"
' Elektrolyser opsplitsen: invoer lezen en uitkomsten op de werkbladen zetten.
'
' Macro's (knoppen op het werkblad Invoer):
'   Bereken             vergelijking per moduleaantal, met kosten, omslagpunten en een voorbeelddag
'   BerekenGevoeligheid hoe het voordeel van N modules verschuift als elke aanname 25 % verandert
'   BerekenOmslagkaart  goedkoopste aantal modules per minimumlast en vaste kosten per module
'   BerekenDagverloop   tijdstappen van één dag per moduleaantal
'   BerekenAlles        de vier hierboven na elkaar
'   TechnologieLaden    standaardwaarden van de gekozen technologie in de kolom Waarde zetten
'   CacheLegen          bewaarde simulaties vergeten (na het wijzigen van Data_Aanbod)
Option Explicit

Public Const SHEET_INVOER As String = "Invoer"
Public Const SHEET_RESULTATEN As String = "Resultaten"
Public Const SHEET_GEVOELIGHEID As String = "Gevoeligheid"
Public Const SHEET_OMSLAG As String = "Omslagkaart"
Public Const SHEET_DAG As String = "Dagverloop"

' Keuzes op Invoer (kolom C) en de aannametabel; scripts/build-opsplitsing-excel.py schrijft dezelfde plaatsen.
Public Const CELL_TECHNOLOGIE As String = "C4"
Public Const CELL_BESTURING As String = "C5"
Public Const CELL_STANDBY As String = "C6"
Public Const CELL_PARKEN As String = "C7"
Public Const CELL_JAREN As String = "C8"
Public Const CELL_MODULES As String = "C9"
Public Const CELL_GEVOELIGHEID_N As String = "C10"
Public Const CELL_DAG As String = "C11"
Public Const CELL_STATUS As String = "C12"
Public Const CELL_VOORBEELDDAG As String = "I11"   ' verborgen kolom: voorbeelddag van de laatste Bereken
Public Const TABLE_FIRST_ROW As Long = 16       ' eerste aanname; kopregel erboven
Public Const COL_GROEP As Long = 1
Public Const COL_LABEL As Long = 2
Public Const COL_WAARDE As Long = 3
Public Const COL_EENHEID As Long = 4
Public Const COL_MIN As Long = 5
Public Const COL_MAX As Long = 6
Public Const COL_BRON As Long = 7
Public Const COL_UITLEG As Long = 8
Public Const COL_KEY As Long = 9
Public Const COL_SCHAAL As Long = 10
Public Const COL_TECH_FIRST As Long = 11       ' standaardwaarden per technologie; kopregel bevat de naam

Private gLabels(0 To 37) As String
Private gUnits(0 To 37) As String
Private gLows(0 To 37) As Double
Private gHighs(0 To 37) As Double
Private gScales(0 To 37) As Double

' ---------------------------------------------------------------- invoer

Public Function KeyIndex(ByVal key As String) As Long
    Select Case key
        Case "capaciteit_mw": KeyIndex = A_CAPACITEIT_MW
        Case "minimumlast": KeyIndex = A_MINIMUMLAST
        Case "systeemverbruik_vol": KeyIndex = A_SYSTEEMVERBRUIK_VOL
        Case "deellastvoordeel": KeyIndex = A_DEELLASTVOORDEEL
        Case "faradayverlies_10": KeyIndex = A_FARADAYVERLIES_10
        Case "bop_vast": KeyIndex = A_BOP_VAST
        Case "bop_variabel": KeyIndex = A_BOP_VARIABEL
        Case "degradatie_jaar": KeyIndex = A_DEGRADATIE_JAAR
        Case "degradatie_jaren": KeyIndex = A_DEGRADATIE_JAREN
        Case "min_aan_min": KeyIndex = A_MIN_AAN_MIN
        Case "min_uit_min": KeyIndex = A_MIN_UIT_MIN
        Case "startvertraging_min": KeyIndex = A_STARTVERTRAGING_MIN
        Case "standby": KeyIndex = A_STANDBY
        Case "koud_na_uur": KeyIndex = A_KOUD_NA_UUR
        Case "opstart_warm_min": KeyIndex = A_OPSTART_WARM_MIN
        Case "opstart_koud_min": KeyIndex = A_OPSTART_KOUD_MIN
        Case "voorspelfout": KeyIndex = A_VOORSPELFOUT
        Case "vooruitkijk_uur": KeyIndex = A_VOORUITKIJK_UUR
        Case "onderhoud_dagen": KeyIndex = A_ONDERHOUD_DAGEN
        Case "storingen_per_jaar": KeyIndex = A_STORINGEN_PER_JAAR
        Case "hersteltijd_uur": KeyIndex = A_HERSTELTIJD_UUR
        Case "stack_levensduur_uur": KeyIndex = A_STACK_LEVENSDUUR_UUR
        Case "stackwissel_weken": KeyIndex = A_STACKWISSEL_WEKEN
        Case "offerte_meur": KeyIndex = A_OFFERTE_MEUR
        Case "offerte_mw": KeyIndex = A_OFFERTE_MW
        Case "offerte_modules": KeyIndex = A_OFFERTE_MODULES
        Case "vaste_kosten_module_meur": KeyIndex = A_VASTE_KOSTEN_MODULE_MEUR
        Case "stack_aandeel": KeyIndex = A_STACK_AANDEEL
        Case "opex_aandeel": KeyIndex = A_OPEX_AANDEEL
        Case "stroomprijs_eur_mwh": KeyIndex = A_STROOMPRIJS_EUR_MWH
        Case "netkosten_eur_mwh": KeyIndex = A_NETKOSTEN_EUR_MWH
        Case "belasting_eur_mwh": KeyIndex = A_BELASTING_EUR_MWH
        Case "rente": KeyIndex = A_RENTE
        Case "looptijd_jaar": KeyIndex = A_LOOPTIJD_JAAR
        Case "capex_subsidie_eur_kw": KeyIndex = A_CAPEX_SUBSIDIE_EUR_KW
        Case "waterstofpremie_eur_kg": KeyIndex = A_WATERSTOFPREMIE_EUR_KG
        Case "korting_net_belasting_eur_mwh": KeyIndex = A_KORTING_NET_BELASTING_EUR_MWH
        Case "zuurstofprijs_eur_t": KeyIndex = A_ZUURSTOFPRIJS_EUR_T
        Case Else: KeyIndex = -1
    End Select
End Function

Private Function Invoer() As Object
    Set Invoer = ThisWorkbook.Worksheets(SHEET_INVOER)
End Function

' parse_aannames(): getoonde waarden uit de kolom Waarde, gecontroleerd tegen de grenzen, omgerekend naar modeleenheden.
Public Function ReadAssumptions() As Variant
    Dim ws As Object, r As Long, key As String, k As Long, v As Variant, a() As Double, seen(0 To 37) As Boolean
    Set ws = Invoer()
    ReDim a(0 To A_LAST)
    r = TABLE_FIRST_ROW
    Do While Len(CStr(ws.Cells(r, COL_KEY).Value)) > 0
        key = CStr(ws.Cells(r, COL_KEY).Value)
        k = KeyIndex(key)
        If k < 0 Then Err.Raise vbObjectError + 20, , "Onbekende aanname '" & key & "' in rij " & r & "."
        gLabels(k) = CStr(ws.Cells(r, COL_LABEL).Value)
        gUnits(k) = CStr(ws.Cells(r, COL_EENHEID).Value)
        gLows(k) = CDbl(ws.Cells(r, COL_MIN).Value)
        gHighs(k) = CDbl(ws.Cells(r, COL_MAX).Value)
        gScales(k) = CDbl(ws.Cells(r, COL_SCHAAL).Value)
        v = ws.Cells(r, COL_WAARDE).Value
        If IsEmpty(v) Or VarType(v) = vbString Or VarType(v) = vbBoolean Then
            Err.Raise vbObjectError + 21, , gLabels(k) & ": kies een waarde van " & gLows(k) & " tot " & gHighs(k) & "."
        End If
        If CDbl(v) < gLows(k) Or CDbl(v) > gHighs(k) Then
            Err.Raise vbObjectError + 21, , gLabels(k) & ": kies een waarde van " & gLows(k) & " tot " & gHighs(k) & "."
        End If
        a(k) = CDbl(v) / gScales(k)
        seen(k) = True
        r = r + 1
    Loop
    For k = 0 To A_LAST
        If Not seen(k) Then Err.Raise vbObjectError + 22, , "De aannametabel op Invoer mist een regel (aanname " & k & ")."
    Next k
    If PerKwEur(a) <= 0 Then
        Err.Raise vbObjectError + 23, , "Vaste kosten per module × aantal units moeten onder de prijs van de referentieofferte blijven."
    End If
    ReadAssumptions = a
End Function

Private Function ReadStrategy() As String
    Dim s As String
    s = LCase(Trim(CStr(Invoer().Range(CELL_BESTURING).Value)))
    If s <> "verdelen" And s <> "bijschakelen" And s <> "samen" Then Err.Raise vbObjectError + 24, , "Kies een besturing: verdelen, bijschakelen of samen."
    ReadStrategy = s
End Function

Private Function ReadStandby() As String
    Dim s As String
    s = LCase(Trim(CStr(Invoer().Range(CELL_STANDBY).Value)))
    If s <> "vast" And s <> "voorspelling" Then Err.Raise vbObjectError + 25, , "Kies een stand-by-beleid: vast of voorspelling."
    ReadStandby = s
End Function

Private Function ReadParks() As Long
    Dim s As String
    s = LCase(CStr(Invoer().Range(CELL_PARKEN).Value))
    If InStr(s, "beide") > 0 Then
        ReadParks = PARKEN_BEIDE
    ElseIf InStr(s, "fryslân") > 0 Or InStr(s, "fryslan") > 0 Then
        ReadParks = PARKEN_FRYSLAN
    ElseIf InStr(s, "beabuorren") > 0 Then
        ReadParks = PARKEN_BEABUORREN
    Else
        Err.Raise vbObjectError + 26, , "Kies minstens één windpark: Windpark Fryslân, Windpark Beabuorren of beide."
    End If
End Function

Public Function ParkName(ByVal parks As Long) As String
    Select Case parks
        Case PARKEN_FRYSLAN: ParkName = "Windpark Fryslân (10 %)"
        Case PARKEN_BEABUORREN: ParkName = "Windpark Beabuorren (100 %)"
        Case Else: ParkName = "Beide: 10 % van Windpark Fryslân en Windpark Beabuorren"
    End Select
End Function

' Lijst als "1-6, 8, 10-12" of "2022, 2025" naar oplopende, unieke getallen tussen low en high.
Public Function ParseList(ByVal txt As String, ByVal low As Long, ByVal high As Long, ByVal what As String) As Variant
    Dim parts As Variant, p As Long, part As String, dash As Long, a As Long, b As Long, v As Long, used() As Boolean, out() As Long, c As Long
    ReDim used(low To high)
    txt = Replace(Replace(Replace(txt, ";", ","), " ", ""), Chr(150), "-")
    txt = Replace(txt, ChrW(8211), "-")
    If Len(txt) = 0 Then Err.Raise vbObjectError + 27, , "Kies minstens één " & what & "."
    parts = Split(txt, ",")
    For p = LBound(parts) To UBound(parts)
        part = parts(p)
        If Len(part) > 0 Then
            dash = InStr(part, "-")
            If dash > 0 Then
                If Not IsNumeric(Left(part, dash - 1)) Or Not IsNumeric(Mid(part, dash + 1)) Then Err.Raise vbObjectError + 27, , "Onbekend " & what & ": " & part & "."
                a = CLng(Left(part, dash - 1)): b = CLng(Mid(part, dash + 1))
            Else
                If Not IsNumeric(part) Then Err.Raise vbObjectError + 27, , "Onbekend " & what & ": " & part & "."
                a = CLng(part): b = a
            End If
            If a > b Or a < low Or b > high Then Err.Raise vbObjectError + 27, , "Kies " & what & " van " & low & " tot en met " & high & "."
            For v = a To b
                used(v) = True
            Next v
        End If
    Next p
    ReDim out(0 To high - low)
    For v = low To high
        If used(v) Then
            out(c) = v: c = c + 1
        End If
    Next v
    If c = 0 Then Err.Raise vbObjectError + 27, , "Kies minstens één " & what & "."
    ReDim Preserve out(0 To c - 1)
    ParseList = out
End Function

Private Function ReadYears() As Variant
    Dim avail As Variant, years As Variant, i As Long, j As Long, ok As Boolean
    avail = AvailableYears()
    years = ParseList(CStr(Invoer().Range(CELL_JAREN).Value), avail(LBound(avail)), avail(UBound(avail)), "windjaar")
    For i = LBound(years) To UBound(years)
        ok = False
        For j = LBound(avail) To UBound(avail)
            If avail(j) = years(i) Then ok = True
        Next j
        If Not ok Then Err.Raise vbObjectError + 28, , "Kies windjaren uit de lijst: " & JoinLongs(avail) & "."
    Next i
    ReadYears = years
End Function

Private Function ReadCounts() As Variant
    ReadCounts = ParseList(CStr(Invoer().Range(CELL_MODULES).Value), 1, MAX_MODULES, "moduleaantal")
End Function

Public Function JoinLongs(list As Variant) As String
    Dim i As Long, s As String
    For i = LBound(list) To UBound(list)
        If i > LBound(list) Then s = s & ", "
        s = s & list(i)
    Next i
    JoinLongs = s
End Function

Private Sub SetStatus(ByVal txt As String)
    On Error Resume Next
    Invoer().Range(CELL_STATUS).Value = txt
    Application.StatusBar = False
End Sub

Private Sub BeginWork()
    On Error Resume Next
    Application.ScreenUpdating = False
    Application.Calculation = -4135   ' xlCalculationManual
End Sub

Private Sub EndWork()
    On Error Resume Next
    Application.Calculation = -4105   ' xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = False
End Sub

Private Function Sheet(ByVal nm As String) As Object
    Dim ws As Object
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nm)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = nm
    End If
    ws.Cells.Clear
    Set Sheet = ws
End Function

Private Function Nz(v As Variant) As Variant
    ' Lege uitkomst (None in Python) als lege cel.
    If IsEmpty(v) Then Nz = "" Else Nz = v
End Function

Private Sub Header(ws As Object, ByVal row As Long, labels As Variant)
    Dim i As Long
    For i = LBound(labels) To UBound(labels)
        ws.Cells(row, 1 + i - LBound(labels)).Value = labels(i)
    Next i
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 1 + UBound(labels) - LBound(labels)))
        .Font.Bold = True
        .WrapText = True
        .VerticalAlignment = -4160   ' xlTop
    End With
End Sub

Private Sub Title(ws As Object, ByVal txt As String, ByVal subtitle As String)
    ws.Cells(1, 1).Value = txt
    ws.Cells(1, 1).Font.Bold = True
    ws.Cells(1, 1).Font.Size = 14
    ws.Cells(2, 1).Value = subtitle
End Sub

Private Function SettingsText(ByVal strategy As String, ByVal standbyMode As String, ByVal parks As Long, years As Variant) As String
    SettingsText = "Besturing: " & strategy & " · stand-by: " & standbyMode & " · windjaren: " & JoinLongs(years) & " · aanbod: " & ParkName(parks) & _
                   " · modelversie " & MODEL_VERSION
End Function

Private Sub Fail(ByVal what As String)
    Dim msg As String
    msg = Err.Description
    EndWork
    SetStatus what & " mislukt: " & msg
    MsgBox msg, vbExclamation, "Opsplitsing"
End Sub

' ---------------------------------------------------------------- Bereken

Public Sub Bereken()
    Dim a() As Double, years As Variant, counts As Variant, strategy As String, standbyMode As String, parks As Long
    Dim rows As Variant, began As Double, dag As Variant
    On Error GoTo failed
    a = ReadAssumptions(): years = ReadYears(): counts = ReadCounts()
    strategy = ReadStrategy(): standbyMode = ReadStandby(): parks = ReadParks()
    BeginWork
    began = Timer
    rows = RunModel(a, years, counts, strategy, standbyMode, parks)
    dag = ExampleDay(a, years, counts, strategy, standbyMode, parks)
    WriteResults rows, a, years, counts, strategy, standbyMode, parks, dag, Timer - began
    EndWork
    SetStatus "Berekend: " & (UBound(rows) + 1) & " configuraties in " & Format(Timer - began, "0.0") & " s (" & CacheHits & " simulaties uit het geheugen)."
    Exit Sub
failed:
    Fail "Bereken"
End Sub

Private Sub WriteResults(rows As Variant, a() As Double, years As Variant, counts As Variant, ByVal strategy As String, _
                         ByVal standbyMode As String, ByVal parks As Long, dag As Variant, ByVal seconds As Double)
    Dim ws As Object, r As Long, row As Variant, out() As Variant, c As Long, best As Variant, ref1 As Variant, ln As Long
    Dim y As Long, jr As Variant, labels As Variant
    Set ws = Sheet(SHEET_RESULTATEN)
    Title ws, "Elektrolyser opsplitsen: vergelijking per aantal modules", SettingsText(strategy, standbyMode, parks, years)
    ref1 = rows(0)
    For r = 0 To UBound(rows)
        If rows(r)(X_BESTE) Then best = rows(r)
    Next r
    ws.Cells(3, 1).Value = Conclusion(rows, best, ref1)
    labels = Array("Modules", "Module (MW)", "Waterstof (t/jaar)", "Benutting aanbod", "Bedrijfsuren per module", "Uren met productie", _
                   "Warme starts per module", "Koude starts per module", "Warm stand-by (uur per module)", "Vermeden starts per module", _
                   "Stilstand stackwissel (dagen per module)", "Jaren tot stackwissel", "CAPEX (M€)", "Stackvervanging (M€/jaar)", _
                   "Stroom (M€/jaar)", "Kapitaal en vaste OPEX (M€/jaar)", "Kosten (M€/jaar)", "LCOH (€/kg)", "Netto na opbrengsten (€/kg)", _
                   "Hoogste CAPEX voor dezelfde LCOH als 1 module (M€)", "Omslagpunt vaste kosten per module (M€)", "Opsplitsen", _
                   "Extra waterstof t.o.v. vorige (t)", "Extra kosten t.o.v. vorige (M€/jaar)", "Marginale kosten extra kilo's (€/kg)", _
                   "Stap verlaagt LCOH", "Verschil: meer waterstof (€/kg)", "Verschil: duurdere installatie (€/kg)", _
                   "Verschil: stroom per kilo (€/kg)", "Verschil: stackvervanging (€/kg)", "Stroom per kg (kWh/kg)", "Laagste LCOH")
    ln = 5
    Header ws, ln, labels
    ReDim out(0 To UBound(rows), 0 To UBound(labels))
    For r = 0 To UBound(rows)
        row = rows(r)
        out(r, 0) = row(R_MODULES)
        out(r, 1) = row(R_MODULE_MW)
        out(r, 2) = row(R_WATERSTOF_T)
        out(r, 3) = row(R_BENUTTING)
        out(r, 4) = row(R_BEDRIJFSUREN_GEM)
        out(r, 5) = row(R_PRODUCTIE_UUR)
        out(r, 6) = row(R_STARTS_WARM)
        out(r, 7) = row(R_STARTS_KOUD)
        out(r, 8) = row(R_STANDBY_UUR)
        out(r, 9) = row(R_STARTS_VERMEDEN)
        out(r, 10) = row(R_STACKWISSEL_DAGEN)
        out(r, 11) = Nz(row(X_JAREN_TOT_STACKWISSEL))
        out(r, 12) = row(X_CAPEX_MEUR)
        out(r, 13) = row(X_STACK_MEUR_JAAR)
        out(r, 14) = row(X_STROOM_MEUR_JAAR)
        out(r, 15) = row(X_KAPITAAL_MEUR_JAAR)
        out(r, 16) = row(X_KOSTEN_MEUR_JAAR)
        out(r, 17) = Nz(row(X_LCOH))
        out(r, 18) = Nz(row(X_NETTO))
        out(r, 19) = row(X_CAPEX_BREAK_EVEN)
        out(r, 20) = Nz(row(X_VASTE_KOSTEN_BREAK_EVEN))
        If IsEmpty(row(X_OPSPLITSEN)) Then
            out(r, 21) = "basis"
        ElseIf row(X_OPSPLITSEN) = "loont" Then
            out(r, 21) = "loont"
        Else
            out(r, 21) = "loont niet"
        End If
        If r > 0 Then
            out(r, 22) = row(X_EXTRA_WATERSTOF)
            out(r, 23) = row(X_EXTRA_KOSTEN)
            out(r, 24) = Nz(row(X_MARGINAAL))
            If row(X_STAP_LOONT) Then out(r, 25) = "ja" Else out(r, 25) = "nee"
            out(r, 26) = row(X_D_MEER_WATERSTOF)
            out(r, 27) = row(X_D_DUURDERE_INSTALLATIE)
            out(r, 28) = row(X_D_STROOM_PER_KILO)
            out(r, 29) = row(X_D_STACKVERVANGING)
            out(r, 30) = row(X_D_KWH_DEZE)
        Else
            For c = 22 To 29
                out(r, c) = ""
            Next c
            out(r, 30) = (row(R_VERBRUIK_MWH) + row(R_STANDBY_MWH)) * 1000 / (row(R_WATERSTOF_T) * 1000)
        End If
        If row(X_BESTE) Then out(r, 31) = "laagste" Else out(r, 31) = ""
    Next r
    ws.Range(ws.Cells(ln + 1, 1), ws.Cells(ln + 1 + UBound(rows), 1 + UBound(labels))).Value = out
    FormatColumns ws, ln + 1, ln + 1 + UBound(rows), Array("0", "0.00", "#,##0.0", "0.0%", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", _
                  "#,##0", "0.0", "0.0", "#,##0.0", "0.00", "0.00", "0.00", "0.00", "0.000", "0.000", "#,##0.0", "0.00", "@", "#,##0.0", _
                  "0.00", "0.00", "@", "0.000", "0.000", "0.000", "0.000", "0.0", "@")
    For r = 0 To UBound(rows)
        If rows(r)(X_BESTE) Then ws.Range(ws.Cells(ln + 1 + r, 1), ws.Cells(ln + 1 + r, 1 + UBound(labels))).Font.Bold = True
    Next r

    ' Per windjaar.
    ln = ln + UBound(rows) + 4
    ws.Cells(ln, 1).Value = "Per windjaar"
    ws.Cells(ln, 1).Font.Bold = True
    ln = ln + 1
    ws.Cells(ln, 1).Value = "Modules"
    For y = 0 To UBound(years)
        ws.Cells(ln, 2 + 3 * y).Value = "Waterstof " & years(y) & " (t)"
        ws.Cells(ln, 3 + 3 * y).Value = "LCOH " & years(y) & " (€/kg)"
        ws.Cells(ln, 4 + 3 * y).Value = "Netto " & years(y) & " (€/kg)"
    Next y
    ws.Range(ws.Cells(ln, 1), ws.Cells(ln, 1 + 3 * (UBound(years) + 1))).Font.Bold = True
    ReDim out(0 To UBound(rows), 0 To 3 * (UBound(years) + 1))
    For r = 0 To UBound(rows)
        out(r, 0) = rows(r)(R_MODULES)
        jr = rows(r)(X_JAREN)
        For y = 0 To UBound(jr)
            out(r, 1 + 3 * y) = jr(y)(1)
            out(r, 2 + 3 * y) = Nz(jr(y)(2))
            out(r, 3 + 3 * y) = Nz(jr(y)(3))
        Next y
    Next r
    ws.Range(ws.Cells(ln + 1, 1), ws.Cells(ln + 1 + UBound(rows), 1 + 3 * (UBound(years) + 1))).Value = out
    ws.Range(ws.Cells(ln + 1, 2), ws.Cells(ln + 1 + UBound(rows), 1 + 3 * (UBound(years) + 1))).NumberFormat = "0.000"

    ' Aanbod per windjaar.
    ln = ln + UBound(rows) + 4
    ws.Cells(ln, 1).Value = "Aanbod"
    ws.Cells(ln, 1).Font.Bold = True
    Header ws, ln + 1, Array("Windjaar", "Aanbod (MWh/jaar, naar 8.760 uur)", "Uren met windgegevens", "Gemiddeld aanbod (MW)")
    For y = 0 To UBound(years)
        Dim s As Variant
        s = SimulateYear(years(y), parks, counts(0), a, strategy, standbyMode)
        ws.Cells(ln + 2 + y, 1).Value = years(y)
        ws.Cells(ln + 2 + y, 2).Value = s(R_AANBOD_MWH)
        ws.Cells(ln + 2 + y, 3).Value = s(R_DEKKING_UUR)
        ws.Cells(ln + 2 + y, 4).Value = s(R_AANBOD_MWH) / 8760
    Next y
    ws.Range(ws.Cells(ln + 2, 2), ws.Cells(ln + 2 + UBound(years), 3)).NumberFormat = "#,##0"
    ws.Range(ws.Cells(ln + 2, 4), ws.Cells(ln + 2 + UBound(years), 4)).NumberFormat = "0.0"

    ln = ln + UBound(years) + 4
    If IsEmpty(dag) Then
        ws.Cells(ln, 1).Value = "Voorbeelddag: geen dag gevonden waarop opsplitsen helpt."
        Invoer().Range(CELL_VOORBEELDDAG).ClearContents
    Else
        ws.Cells(ln, 1).Value = "Voorbeelddag"
        ws.Cells(ln, 2).Value = dag
        ws.Cells(ln, 2).NumberFormat = "yyyy-mm-dd"
        ws.Cells(ln, 3).Value = "Een gewone dag waarop opsplitsen helpt (75e percentiel van de dagwinst, zonder onderhoud). Laat Invoer!" & CELL_DAG & _
                                  " leeg en kies Dagverloop om hem te bekijken."
        Invoer().Range(CELL_VOORBEELDDAG).Value = dag   ' onthouden voor BerekenDagverloop
    End If
    ws.Cells(ln + 1, 1).Value = "Rekentijd " & Format(seconds, "0.0") & " s; " & CacheMisses & " simulaties gerekend, " & CacheHits & " uit het geheugen."
    ws.Columns(1).ColumnWidth = 12
    ws.Range(ws.Columns(2), ws.Columns(32)).ColumnWidth = 13
    ws.Rows(5).RowHeight = 60
End Sub

Private Function Conclusion(rows As Variant, best As Variant, ref1 As Variant) As String
    Dim txt As String
    If best(R_MODULES) = ref1(R_MODULES) Then
        txt = "Laagste kostprijs met " & ref1(R_MODULES) & " module(s): " & Format(ref1(X_LCOH), "0.00") & " €/kg. Opsplitsen verlaagt de kostprijs niet."
    Else
        txt = "Laagste kostprijs met " & best(R_MODULES) & " modules: " & Format(best(X_LCOH), "0.00") & " €/kg, tegen " & _
               Format(ref1(X_LCOH), "0.00") & " €/kg met " & ref1(R_MODULES) & " module(s); " & _
               Format(best(R_WATERSTOF_T) - ref1(R_WATERSTOF_T), "0") & " t waterstof per jaar meer."
    End If
    Conclusion = txt & " Alle elektrolyser- en kostengetallen zijn plaatshouders of EU-standaardwaarden: vervang ze door datasheets en offertes."
End Function

Private Sub FormatColumns(ws As Object, ByVal r1 As Long, ByVal r2 As Long, formats As Variant)
    Dim i As Long
    For i = LBound(formats) To UBound(formats)
        If formats(i) <> "@" Then ws.Range(ws.Cells(r1, 1 + i), ws.Cells(r2, 1 + i)).NumberFormat = formats(i)
    Next i
End Sub

' ---------------------------------------------------------------- Gevoeligheid

Public Sub BerekenGevoeligheid()
    Dim a() As Double, years As Variant, n As Long, strategy As String, standbyMode As String, parks As Long, data As Variant
    Dim ws As Object, items As Variant, i As Long, item As Variant, began As Double, out() As Variant
    On Error GoTo failed
    a = ReadAssumptions(): years = ReadYears()
    strategy = ReadStrategy(): standbyMode = ReadStandby(): parks = ReadParks()
    If Not IsNumeric(Invoer().Range(CELL_GEVOELIGHEID_N).Value) Then Err.Raise vbObjectError + 29, , "Kies een aantal modules voor de gevoeligheid."
    n = CLng(Invoer().Range(CELL_GEVOELIGHEID_N).Value)
    BeginWork
    began = Timer
    data = Sensitivity(a, years, n, strategy, standbyMode, parks, gLows, gHighs, gScales)
    Set ws = Sheet(SHEET_GEVOELIGHEID)
    Title ws, "Gevoeligheid: voordeel van " & n & " modules boven 1 module", SettingsText(strategy, standbyMode, parks, years)
    ws.Cells(3, 1).Value = "Voordeel nu (LCOH 1 module min LCOH " & n & " modules)"
    ws.Cells(3, 4).Value = data(0)
    ws.Cells(3, 4).NumberFormat = "0.000"" €/kg"""
    ws.Cells(4, 1).Value = "Positief: " & n & " modules zijn goedkoper per kilo. Elke aanname gaat 25 % omlaag en omhoog (binnen de grenzen van het veld); " & _
                           "kosten rekenen opnieuw zonder simulatie, bedrijfsvoering met een nieuwe simulatie. Gesorteerd op bereik."
    Header ws, 6, Array("Aanname", "Eenheid", "Soort", "Nu", "Laag", "Voordeel bij laag (€/kg)", "Hoog", "Voordeel bij hoog (€/kg)", "Bereik (€/kg)", "Wisselt van teken")
    items = data(1)
    If Not IsEmpty(items) Then
        ReDim out(0 To UBound(items), 0 To 9)
        For i = 0 To UBound(items)
            item = items(i)
            out(i, 0) = gLabels(item(0)): out(i, 1) = gUnits(item(0)): out(i, 2) = item(2)
            out(i, 3) = item(1): out(i, 4) = item(3): out(i, 5) = item(4): out(i, 6) = item(5): out(i, 7) = item(6): out(i, 8) = item(7)
            If (item(4) > 0) <> (item(6) > 0) Or (data(0) > 0) <> (item(4) > 0) Or (data(0) > 0) <> (item(6) > 0) Then out(i, 9) = "ja" Else out(i, 9) = ""
        Next i
        ws.Range(ws.Cells(7, 1), ws.Cells(7 + UBound(items), 10)).Value = out
        ws.Range(ws.Cells(7, 4), ws.Cells(7 + UBound(items), 5)).NumberFormat = "0.###"
        ws.Range(ws.Cells(7, 7), ws.Cells(7 + UBound(items), 7)).NumberFormat = "0.###"
        ws.Range(ws.Cells(7, 6), ws.Cells(7 + UBound(items), 6)).NumberFormat = "0.000"
        ws.Range(ws.Cells(7, 8), ws.Cells(7 + UBound(items), 9)).NumberFormat = "0.000"
    End If
    ws.Columns(1).ColumnWidth = 34
    ws.Range(ws.Columns(2), ws.Columns(10)).ColumnWidth = 14
    ws.Rows(6).RowHeight = 45
    EndWork
    SetStatus "Gevoeligheid berekend in " & Format(Timer - began, "0.0") & " s."
    Exit Sub
failed:
    Fail "Gevoeligheid"
End Sub

' ---------------------------------------------------------------- Omslagkaart

Public Sub BerekenOmslagkaart()
    Dim a() As Double, years As Variant, counts As Variant, strategy As String, standbyMode As String, parks As Long
    Dim grid As Variant, ws As Object, ml As Variant, vk As Variant, i As Long, f As Long, cell As Variant, began As Double
    Dim cur As Boolean
    On Error GoTo failed
    a = ReadAssumptions(): years = ReadYears(): counts = ReadCounts()
    strategy = ReadStrategy(): standbyMode = ReadStandby(): parks = ReadParks()
    BeginWork
    began = Timer
    grid = Omslagkaart(a, years, counts, strategy, standbyMode, parks)
    ml = OmslagMinimumlast(): vk = OmslagVasteKosten()
    Set ws = Sheet(SHEET_OMSLAG)
    Title ws, "Omslagkaart: goedkoopste aantal modules", SettingsText(strategy, standbyMode, parks, years) & " · moduleaantallen: " & JoinLongs(counts)
    ws.Cells(3, 1).Value = "Per minimumlast (rij) en vaste kosten per module (kolom): het aantal modules met de laagste LCOH. " & _
                           "Daaronder de LCOH van dat aantal en die van " & counts(0) & " module(s). Vet: de huidige aannames (dichtstbijzijnde cel)."
    ws.Cells(5, 1).Value = "Minimumlast \ vaste kosten (M€)"
    For f = 0 To UBound(vk)
        ws.Cells(5, 2 + f).Value = vk(f)
        ws.Cells(5, 2 + f).NumberFormat = "0.00"
    Next f
    ws.Range(ws.Cells(5, 1), ws.Cells(5, 2 + UBound(vk))).Font.Bold = True
    For i = 0 To UBound(ml)
        ws.Cells(6 + 3 * i, 1).Value = Format(ml(i) * 100, "0") & " %: aantal"
        ws.Cells(7 + 3 * i, 1).Value = "LCOH (€/kg)"
        ws.Cells(8 + 3 * i, 1).Value = "LCOH " & counts(0) & " module(s)"
        For f = 0 To UBound(vk)
            cell = grid(i, f)
            If IsEmpty(cell) Then
                ws.Cells(6 + 3 * i, 2 + f).Value = "–"
            Else
                ws.Cells(6 + 3 * i, 2 + f).Value = cell(0)
                ws.Cells(7 + 3 * i, 2 + f).Value = Nz(cell(1))
                ws.Cells(8 + 3 * i, 2 + f).Value = Nz(cell(2))
                ws.Cells(7 + 3 * i, 2 + f).NumberFormat = "0.00"
                ws.Cells(8 + 3 * i, 2 + f).NumberFormat = "0.00"
                If cell(0) <> counts(0) Then ws.Cells(6 + 3 * i, 2 + f).Interior.Color = RGB(214, 236, 214)
            End If
            cur = (NearestIndex(ml, a(A_MINIMUMLAST)) = i) And (NearestIndex(vk, a(A_VASTE_KOSTEN_MODULE_MEUR)) = f)
            If cur Then ws.Range(ws.Cells(6 + 3 * i, 2 + f), ws.Cells(8 + 3 * i, 2 + f)).Font.Bold = True
        Next f
        ws.Cells(6 + 3 * i, 1).Font.Bold = True
    Next i
    ws.Columns(1).ColumnWidth = 30
    ws.Range(ws.Columns(2), ws.Columns(2 + UBound(vk))).ColumnWidth = 9
    EndWork
    SetStatus "Omslagkaart berekend in " & Format(Timer - began, "0.0") & " s."
    Exit Sub
failed:
    Fail "Omslagkaart"
End Sub

Private Function NearestIndex(list As Variant, ByVal value As Double) As Long
    Dim i As Long, best As Long
    best = LBound(list)
    For i = LBound(list) To UBound(list)
        If Abs(list(i) - value) < Abs(list(best) - value) Then best = i
    Next i
    NearestIndex = best
End Function

' ---------------------------------------------------------------- Dagverloop

Public Sub BerekenDagverloop()
    Dim a() As Double, counts As Variant, strategy As String, standbyMode As String, parks As Long, dag As Variant, data As Variant
    Dim ws As Object, c As Long, conf As Variant, steps As Variant, n As Long, r As Long, i As Long, ln As Long, out() As Variant
    Dim cols As Long, j As Long, predict As Boolean, began As Double
    On Error GoTo failed
    a = ReadAssumptions(): counts = ReadCounts()
    strategy = ReadStrategy(): standbyMode = ReadStandby(): parks = ReadParks()
    predict = (standbyMode = "voorspelling")
    dag = Invoer().Range(CELL_DAG).Value
    If IsEmpty(dag) Or CStr(dag) = "" Then
        dag = Empty
        dag = Invoer().Range(CELL_VOORBEELDDAG).Value
        If IsEmpty(dag) Or CStr(dag) = "" Then Err.Raise vbObjectError + 30, , "Vul een datum in bij Invoer!" & CELL_DAG & " of kies eerst Bereken voor de voorbeelddag."
    End If
    If Not IsDate(dag) And Not IsNumeric(dag) Then Err.Raise vbObjectError + 30, , "Geen geldige datum bij Invoer!" & CELL_DAG & "."
    BeginWork
    began = Timer
    data = DayTrace(a, CDate(dag), counts, strategy, standbyMode, parks)
    Set ws = Sheet(SHEET_DAG)
    Title ws, "Dagverloop " & Format(CDate(dag), "yyyy-mm-dd"), SettingsText(strategy, standbyMode, parks, Array(Year(CDate(dag))))
    ws.Cells(3, 1).Value = "Per tien minuten (Europe/Amsterdam). De simulatie begint twee dagen eerder om warm te lopen. Waterstof per stap " & _
                           "zonder de vaste storingsafslag; stack in MW per module, ‘opstart’ is de minuten zonder productie in deze stap."
    ln = 5
    For c = LBound(data) To UBound(data)
        conf = data(c)
        n = conf(0)
        steps = conf(2)
        ws.Cells(ln, 1).Value = n & " module(s) van " & Format(conf(1), "0.00") & " MW · waterstof deze dag " & Format(conf(3), "#,##0.0") & _
                                  " kg · minimaal aanbod om één module te laten draaien " & Format(conf(4), "0.00") & " MW"
        ws.Cells(ln, 1).Font.Bold = True
        ln = ln + 1
        cols = 6 + 4 * n
        If predict Then cols = cols + 2 + 2 * n
        ReDim out(0 To UBound(steps, 1) + 1, 0 To cols - 1)
        out(0, 0) = "Tijd": out(0, 1) = "Aanbod (MW)": out(0, 2) = "Verbruik (MW)": out(0, 3) = "Gewenst": out(0, 4) = "Passen"
        For i = 0 To n - 1
            out(0, 5 + i) = "Stack " & (i + 1) & " (MW)"
            out(0, 5 + n + i) = "H2 " & (i + 1) & " (kg)"
            out(0, 5 + 2 * n + i) = "Opstart " & (i + 1) & " (min)"
            out(0, 5 + 3 * n + i) = "Onderhoud " & (i + 1)
        Next i
        j = 5 + 4 * n
        If predict Then
            out(0, j) = "Voorspeld aanbod (MW)": out(0, j + 1) = "Voorspeld gewenst"
            For i = 0 To n - 1
                out(0, j + 2 + i) = "Warmte " & (i + 1)
                out(0, j + 2 + n + i) = "Toestand " & (i + 1)
            Next i
            j = j + 2 + 2 * n
        End If
        out(0, j) = "Waarom niet meer modules"
        For r = 0 To UBound(steps, 1)
            out(r + 1, 0) = CDate(UnixToLocal(steps(r, TR_T)))
            out(r + 1, 1) = steps(r, TR_AANBOD): out(r + 1, 2) = steps(r, TR_VERBRUIK)
            out(r + 1, 3) = steps(r, TR_GEWENST): out(r + 1, 4) = steps(r, TR_PASSEN)
            For i = 0 To n - 1
                out(r + 1, 5 + i) = steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_STACK)
                out(r + 1, 5 + n + i) = steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_KG)
                out(r + 1, 5 + 2 * n + i) = steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_OPSTART)
                If steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_UIT) Then out(r + 1, 5 + 3 * n + i) = "ja" Else out(r + 1, 5 + 3 * n + i) = ""
            Next i
            j = 5 + 4 * n
            If predict Then
                out(r + 1, j) = steps(r, TR_VOORSPELLING): out(r + 1, j + 1) = steps(r, TR_VOORSPELD_GEWENST)
                For i = 0 To n - 1
                    out(r + 1, j + 2 + i) = steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_WARMTE)
                    out(r + 1, j + 2 + n + i) = steps(r, TR_MODULES + TR_PER_MODULE * i + TRM_TOESTAND)
                Next i
                j = j + 2 + 2 * n
            End If
            out(r + 1, j) = steps(r, TR_REDENEN)
        Next r
        ws.Range(ws.Cells(ln, 1), ws.Cells(ln + UBound(out, 1), cols)).Value = out
        ws.Range(ws.Cells(ln, 1), ws.Cells(ln, cols)).Font.Bold = True
        ws.Range(ws.Cells(ln + 1, 1), ws.Cells(ln + UBound(out, 1), 1)).NumberFormat = "hh:mm"
        ln = ln + UBound(out, 1) + 3
    Next c
    ws.Columns(1).ColumnWidth = 8
    EndWork
    SetStatus "Dagverloop " & Format(CDate(dag), "yyyy-mm-dd") & " berekend in " & Format(Timer - began, "0.0") & " s."
    Exit Sub
failed:
    Fail "Dagverloop"
End Sub

' ---------------------------------------------------------------- overig

Public Sub BerekenAlles()
    Bereken
    If Left(CStr(Invoer().Range(CELL_STATUS).Value), 9) = "Berekend:" Then
        BerekenGevoeligheid
        BerekenOmslagkaart
        BerekenDagverloop
    End If
End Sub

Public Sub TechnologieLaden()
    Dim ws As Object, nm As String, c As Long, r As Long, found As Boolean
    Set ws = Invoer()
    nm = LCase(Trim(CStr(ws.Range(CELL_TECHNOLOGIE).Value)))
    c = COL_TECH_FIRST
    Do While Len(CStr(ws.Cells(TABLE_FIRST_ROW - 1, c).Value)) > 0
        If LCase(Trim(CStr(ws.Cells(TABLE_FIRST_ROW - 1, c).Value))) = nm Then
            found = True
            Exit Do
        End If
        c = c + 1
    Loop
    If Not found Then
        MsgBox "Onbekende technologie '" & nm & "'. Kies een technologie uit de lijst.", vbExclamation, "Opsplitsing"
        Exit Sub
    End If
    r = TABLE_FIRST_ROW
    Do While Len(CStr(ws.Cells(r, COL_KEY).Value)) > 0
        ws.Cells(r, COL_WAARDE).Value = ws.Cells(r, c).Value
        r = r + 1
    Loop
    SetStatus "Standaardwaarden van " & ws.Cells(TABLE_FIRST_ROW - 1, c).Value & " geladen."
End Sub

Public Sub CacheLegen()
    ResetData
    SetStatus "Bewaarde simulaties vergeten; de volgende berekening leest Data_Aanbod opnieuw."
End Sub
