Attribute VB_Name = "OpsplitsingModel"
' Elektrolyser opsplitsen in modules: rekenmodel.
'
' Overzetting naar VBA van src/opsplitsing/python/opsplitsing.py (MODEL_VERSION 18), zoals de pagina /opsplitsing
' het in de browser draait. Dezelfde volgorde van bewerkingen, zodat de uitkomsten op afrondingsruis na gelijk zijn;
' scripts/test-opsplitsing-excel.py vergelijkt dit module met het Python-model.
'
' Dit module leest alleen het werkblad Data_Aanbod (windaanbod per tien minuten). Invoer en uitvoer staan in
' OpsplitsingWerkblad. Aannames zijn een Double-array in de volgorde van de dataclass Aannames (A_... hieronder),
' in modeleenheden (minimumlast 0,25, niet 25).
Option Explicit

Public Const MODEL_VERSION As Long = 18
Public Const MAX_MODULES As Long = 12
Public Const SENSITIVITY_STEP As Double = 0.25
Public Const OXYGEN_KG_PER_KG As Double = 8#
Public Const DATA_SHEET As String = "Data_Aanbod"
Public Const ERR_BASE As Long = -2147221504   ' gelijk aan vbObjectError (dat LibreOffice niet kent)

' ---------------------------------------------------------------- aannames (volgorde van de dataclass)
Public Const A_CAPACITEIT_MW As Long = 0
Public Const A_MINIMUMLAST As Long = 1
Public Const A_SYSTEEMVERBRUIK_VOL As Long = 2
Public Const A_DEELLASTVOORDEEL As Long = 3
Public Const A_FARADAYVERLIES_10 As Long = 4
Public Const A_BOP_VAST As Long = 5
Public Const A_BOP_VARIABEL As Long = 6
Public Const A_DEGRADATIE_JAAR As Long = 7
Public Const A_DEGRADATIE_JAREN As Long = 8
Public Const A_MIN_AAN_MIN As Long = 9
Public Const A_MIN_UIT_MIN As Long = 10
Public Const A_STARTVERTRAGING_MIN As Long = 11
Public Const A_STANDBY As Long = 12
Public Const A_KOUD_NA_UUR As Long = 13
Public Const A_OPSTART_WARM_MIN As Long = 14
Public Const A_OPSTART_KOUD_MIN As Long = 15
Public Const A_VOORSPELFOUT As Long = 16
Public Const A_VOORUITKIJK_UUR As Long = 17
Public Const A_ONDERHOUD_DAGEN As Long = 18
Public Const A_STORINGEN_PER_JAAR As Long = 19
Public Const A_HERSTELTIJD_UUR As Long = 20
Public Const A_STACK_LEVENSDUUR_UUR As Long = 21
Public Const A_STACKWISSEL_WEKEN As Long = 22
Public Const A_OFFERTE_MEUR As Long = 23
Public Const A_OFFERTE_MW As Long = 24
Public Const A_OFFERTE_MODULES As Long = 25
Public Const A_VASTE_KOSTEN_MODULE_MEUR As Long = 26
Public Const A_STACK_AANDEEL As Long = 27
Public Const A_OPEX_AANDEEL As Long = 28
Public Const A_STROOMPRIJS_EUR_MWH As Long = 29
Public Const A_NETKOSTEN_EUR_MWH As Long = 30
Public Const A_BELASTING_EUR_MWH As Long = 31
Public Const A_RENTE As Long = 32
Public Const A_LOOPTIJD_JAAR As Long = 33
Public Const A_CAPEX_SUBSIDIE_EUR_KW As Long = 34
Public Const A_WATERSTOFPREMIE_EUR_KG As Long = 35
Public Const A_KORTING_NET_BELASTING_EUR_MWH As Long = 36
Public Const A_ZUURSTOFPRIJS_EUR_T As Long = 37
Public Const A_LAST As Long = 37

' Velden die simulate() leest; alleen deze horen in de simulatiecache (zie SimulationMemo in browser-runtime.py).
Private Const SIM_FIELDS_LAST As Long = 22   ' A_CAPACITEIT_MW .. A_STACKWISSEL_WEKEN

' ---------------------------------------------------------------- uitkomst van één simulatie (Variant-array)
Public Const R_MODULES As Long = 0
Public Const R_MODULE_MW As Long = 1
Public Const R_STRATEGIE As Long = 2
Public Const R_JAAR As Long = 3
Public Const R_WATERSTOF_T As Long = 4
Public Const R_VERBRUIK_MWH As Long = 5
Public Const R_STANDBY_MWH As Long = 6
Public Const R_AANBOD_MWH As Long = 7
Public Const R_BENUTTING As Long = 8
Public Const R_BEDRIJFSUREN_GEM As Long = 9
Public Const R_PRODUCTIE_UUR As Long = 10
Public Const R_STARTS_WARM As Long = 11
Public Const R_STARTS_KOUD As Long = 12
Public Const R_STANDBYBELEID As Long = 13
Public Const R_STANDBY_UUR As Long = 14
Public Const R_STARTS_VERMEDEN As Long = 15
Public Const R_EQ_UREN As Long = 16          ' Double-array (0 To n - 1)
Public Const R_DEKKING_UUR As Long = 17
Public Const R_BESCHIKBAARHEID As Long = 18
Public Const R_DAG_DATUM As Long = 19        ' Long-array met datumserienummers (Europe/Amsterdam)
Public Const R_DAG_KG As Long = 20           ' Double-array, afgerond op 0,1 kg zoals in Python
Public Const R_DAG_UIT As Long = 21          ' Boolean-array: een module in onderhoud op die dag
Public Const R_STAPPEN As Long = 22          ' tweedimensionale Variant-array of Empty
Public Const R_STACKWISSEL_DAGEN As Long = 23
' Samengevat over windjaren, met kosten (summarise, economics, break_even).
Public Const X_CAPEX_MEUR As Long = 24
Public Const X_STACK_MEUR_JAAR As Long = 25
Public Const X_KOSTEN_MEUR_JAAR As Long = 26
Public Const X_STROOM_MEUR_JAAR As Long = 27
Public Const X_KAPITAAL_MEUR_JAAR As Long = 28
Public Const X_LCOH As Long = 29             ' Empty als er geen waterstof is
Public Const X_NETTO As Long = 30
Public Const X_JAREN_TOT_STACKWISSEL As Long = 31
Public Const X_PRIJS_PER_KW As Long = 32
Public Const X_JAREN As Long = 33            ' Variant-array (0 To jaren - 1) van Array(jaar, waterstof_t, lcoh, netto)
Public Const X_CAPEX_BREAK_EVEN As Long = 34
Public Const X_VASTE_KOSTEN_BREAK_EVEN As Long = 35
Public Const X_OPSPLITSEN As Long = 36       ' Empty, "loont" of "loont_niet"
Public Const X_D_MEER_WATERSTOF As Long = 37
Public Const X_D_DUURDERE_INSTALLATIE As Long = 38
Public Const X_D_STROOM_PER_KILO As Long = 39
Public Const X_D_STACKVERVANGING As Long = 40
Public Const X_D_KWH_EEN As Long = 41
Public Const X_D_KWH_DEZE As Long = 42
Public Const X_EXTRA_WATERSTOF As Long = 43
Public Const X_EXTRA_KOSTEN As Long = 44
Public Const X_EXTRA_PRODUCTIE_UUR As Long = 45
Public Const X_MARGINAAL As Long = 46
Public Const X_STAP_LOONT As Long = 47
Public Const X_BESTE As Long = 48
Public Const X_LAST As Long = 48

' Kolommen van het dagverloop (R_STAPPEN); daarna per module zes kolommen (TR_PER_MODULE).
Public Const TR_T As Long = 0
Public Const TR_AANBOD As Long = 1
Public Const TR_VERBRUIK As Long = 2
Public Const TR_GEWENST As Long = 3
Public Const TR_PASSEN As Long = 4
Public Const TR_REDENEN As Long = 5
Public Const TR_VOORSPELLING As Long = 6
Public Const TR_VOORSPELD_GEWENST As Long = 7
Public Const TR_MODULES As Long = 8
Public Const TR_PER_MODULE As Long = 6       ' stack, kg, opstart_min, uit, warmte, toestand
Public Const TRM_STACK As Long = 0
Public Const TRM_KG As Long = 1
Public Const TRM_OPSTART As Long = 2
Public Const TRM_UIT As Long = 3
Public Const TRM_WARMTE As Long = 4
Public Const TRM_TOESTAND As Long = 5

' Parkkeuze: kolomblok in Data_Aanbod.
Public Const PARKEN_BEIDE As Long = 0
Public Const PARKEN_FRYSLAN As Long = 1
Public Const PARKEN_BEABUORREN As Long = 2

Private Const STEP_H As Double = 1# / 6#
Private Const COLS_PER_YEAR As Long = 8      ' t, z, en per parkkeuze mw en mw (op 0,01 afgerond)

' ---------------------------------------------------------------- windaanbod uit Data_Aanbod
Private gYears() As Long
Private gYearCount As Long
Private gLoaded As Boolean
Private gT As Variant, gZ As Variant, gMW As Variant, gMW2 As Variant   ' per jaar en parkkeuze
Private gCacheKeys() As String     ' simulatiecache: sleutel en uitkomst, oudste eerst
Private gCacheValues() As Variant
Private gCacheCount As Long
Private Const CACHE_LIMIT As Long = 1000
Public CacheHits As Long
Public CacheMisses As Long
Public ProgressDone As Long
Public ProgressTotal As Long
Public ProgressLabel As String

Public Function STRATEGIES() As Variant
    STRATEGIES = Array("verdelen", "bijschakelen", "samen")
End Function

Public Function STANDBY_MODES() As Variant
    STANDBY_MODES = Array("vast", "voorspelling")
End Function

Public Function MODULE_COUNTS() As Variant
    MODULE_COUNTS = Array(1, 2, 3, 4, 5, 6, 8, 10, 11, 12)
End Function

Public Sub ResetData()
    gLoaded = False
    gYearCount = 0
    ClearCache
End Sub

Public Sub ClearCache()
    ReDim gCacheKeys(0 To CACHE_LIMIT - 1)
    ReDim gCacheValues(0 To CACHE_LIMIT - 1)
    gCacheCount = 0
    CacheHits = 0
    CacheMisses = 0
End Sub

Private Sub EnsureData()
    If gLoaded Then Exit Sub
    ' Rij 1: kop ("t 2022", "z 2022", ...), rij 2: aantal tijdstappen, vanaf rij 3 de waarden. Per jaar COLS_PER_YEAR kolommen.
    Dim ws As Object, c As Long, y As Long, p As Long, rows As Long, i As Long
    Set ws = ThisWorkbook.Worksheets(DATA_SHEET)
    gYearCount = 0
    Do While Len(CStr(ws.Cells(1, gYearCount * COLS_PER_YEAR + 1).Value)) > 0
        gYearCount = gYearCount + 1
    Loop
    If gYearCount < 1 Then Err.Raise ERR_BASE + 1, , "Geen windaanbod gevonden op het werkblad " & DATA_SHEET & "."
    ReDim gYears(0 To gYearCount - 1)
    Dim tt() As Variant, zz() As Variant, mm() As Variant, m2() As Variant
    ReDim tt(0 To gYearCount - 1): ReDim zz(0 To gYearCount - 1)
    ReDim mm(0 To gYearCount - 1, 0 To 2): ReDim m2(0 To gYearCount - 1, 0 To 2)
    For y = 0 To gYearCount - 1
        c = y * COLS_PER_YEAR + 1
        gYears(y) = CLng(Val(Mid(CStr(ws.Cells(1, c).Value), 3)))   ' kop "t 2022"
        rows = CLng(ws.Cells(2, c).Value)
        tt(y) = ColumnValues(ws, c, rows)
        zz(y) = ColumnValues(ws, c + 1, rows)
        For p = 0 To 2
            mm(y, p) = ColumnValues(ws, c + 2 + 2 * p, rows)
            m2(y, p) = ColumnValues(ws, c + 3 + 2 * p, rows)
        Next p
    Next y
    gT = tt: gZ = zz: gMW = mm: gMW2 = m2
    gLoaded = True
    If gCacheCount = 0 Then ClearCache
End Sub

Private Function ColumnValues(ws As Object, ByVal col As Long, ByVal rows As Long) As Variant
    Dim raw As Variant, out() As Double, i As Long
    If rows < 1 Then
        ReDim out(0 To -1 + 1)
        ColumnValues = out
        Exit Function
    End If
    raw = ws.Range(ws.Cells(3, col), ws.Cells(rows + 2, col)).Value
    ReDim out(0 To rows - 1)
    If rows = 1 Then
        out(0) = CDbl(raw)
    Else
        For i = 0 To rows - 1
            out(i) = CDbl(raw(i + 1, 1))
        Next i
    End If
    ColumnValues = out
End Function

Public Function AvailableYears() As Variant
    EnsureData
    Dim out() As Long, i As Long
    ReDim out(0 To gYearCount - 1)
    For i = 0 To gYearCount - 1
        out(i) = gYears(i)
    Next i
    AvailableYears = out
End Function

Private Function YearIndex(ByVal yr As Long) As Long
    Dim i As Long
    EnsureData
    For i = 0 To gYearCount - 1
        If gYears(i) = yr Then
            YearIndex = i
            Exit Function
        End If
    Next i
    Err.Raise ERR_BASE + 2, , "Geen windgegevens voor " & yr & "."
End Function

Public Function SupplyLength(ByVal yr As Long) As Long
    Dim y As Long
    y = YearIndex(yr)
    SupplyLength = UBound(gT(y)) + 1
End Function

' ---------------------------------------------------------------- tijd (Europe/Amsterdam)

Private Function LastSundayUtc(ByVal yr As Long, ByVal mon As Long) As Double
    ' 01:00 UTC op de laatste zondag van de maand, als datumserienummer in UTC.
    Dim d As Double
    d = DateSerial(yr, mon + 1, 1) - 1
    Do While Weekday(d, vbSunday) <> vbSunday
        d = d - 1
    Loop
    LastSundayUtc = d + 1# / 24#
End Function

Private Sub SummerBounds(ByVal y As Long, lo As Double, hi As Double)
    ' Begin en eind van de zomertijd in UTC, per jaar onthouden: dit wordt voor elke tijdstap gevraagd.
    Static knownYear As Long, knownLo As Double, knownHi As Double
    If knownYear <> y Then
        knownLo = LastSundayUtc(y, 3): knownHi = LastSundayUtc(y, 10): knownYear = y
    End If
    lo = knownLo: hi = knownHi
End Sub

Private Function IsSummerUtc(ByVal utc As Double) As Boolean
    Dim lo As Double, hi As Double
    SummerBounds Year(utc), lo, hi
    IsSummerUtc = utc >= lo And utc < hi
End Function

Public Function UnixToLocal(ByVal stamp As Double) As Double
    Dim utc As Double
    utc = 25569# + stamp / 86400#
    If IsSummerUtc(utc) Then UnixToLocal = utc + 2# / 24# Else UnixToLocal = utc + 1# / 24#
End Function

Public Function LocalDay(ByVal stamp As Double) As Long
    LocalDay = Int(UnixToLocal(stamp))
End Function

Public Function LocalToUnix(ByVal yr As Long, ByVal days As Double) As Double
    ' Wandkloktijd 1 januari 00:00 van yr plus days dagen (zoals datetime(yr, 1, 1, tzinfo=LOCAL) + timedelta(days=days)) naar
    ' Unix-tijd, met fold = 0 zoals Python: in het uur dat in maart wegvalt nog wintertijd, in het dubbele uur in oktober zomertijd.
    Dim wall As Double, y As Long, seconds As Double
    wall = DateSerial(yr, 1, 1) + days
    y = Year(wall)
    seconds = (DateSerial(yr, 1, 1) - 25569#) * 86400# + Round(days * 86400#, 6)
    Dim lo As Double, hi As Double
    SummerBounds y, lo, hi
    If wall >= lo + 2# / 24# And wall < hi + 2# / 24# Then
        LocalToUnix = seconds - 7200#
    Else
        LocalToUnix = seconds - 3600#
    End If
End Function

' ---------------------------------------------------------------- hulpfuncties

Private Function Floor(ByVal x As Double) As Double
    Floor = Int(x)
End Function

Private Function Ceil(ByVal x As Double) As Double
    Ceil = -Int(-x)
End Function

Private Function MinD(ByVal x As Double, ByVal y As Double) As Double
    If y < x Then MinD = y Else MinD = x
End Function

Private Function MaxD(ByVal x As Double, ByVal y As Double) As Double
    If y > x Then MaxD = y Else MaxD = x
End Function

Private Function MinL(ByVal x As Long, ByVal y As Long) As Long
    If y < x Then MinL = y Else MinL = x
End Function

Private Function MaxL(ByVal x As Long, ByVal y As Long) As Long
    If y > x Then MaxL = y Else MaxL = x
End Function

Private Function FMod(ByVal x As Double, ByVal m As Double) As Double
    ' Python x % m voor m > 0.
    FMod = x - m * Int(x / m)
End Function

Public Function PyRound(ByVal x As Double, ByVal digits As Long) As Double
    ' Python round(x, digits): afronden van de exacte binaire waarde, halve gevallen naar even.
    PyRound = RoundedUnits(x, 10# ^ digits) / 10# ^ digits
End Function

Private Function Round2Index(ByVal x As Double) As Long
    ' Index van round(x, 2) in honderdsten.
    Round2Index = CLng(RoundedUnits(x, 100#))
End Function

Private Function RoundedUnits(ByVal x As Double, ByVal f As Double) As Double
    ' Het gehele getal dat Python kiest voor round(x * f) als f een macht van tien is. x * f is niet exact, dus wordt het product
    ' als som p + e berekend (Dekker); dan is te zien of x precies op, boven of onder een half ligt.
    Dim p As Double, e As Double, r As Double, d As Double
    TwoProduct x, f, p, e
    r = Int(p)
    d = (p - r) - 0.5
    d = d + e
    If d > 0 Then
        r = r + 1
    ElseIf d = 0 Then
        If r - 2# * Int(r / 2#) <> 0 Then r = r + 1
    End If
    RoundedUnits = r
End Function

Private Sub TwoProduct(ByVal a As Double, ByVal b As Double, p As Double, e As Double)
    Dim c As Double, ah As Double, al As Double, bh As Double, bl As Double
    p = a * b
    c = 134217729# * a: ah = c - (c - a): al = a - ah
    c = 134217729# * b: bh = c - (c - b): bl = b - bh
    e = ((ah * bh - p) + ah * bl + al * bh) + al * bl
End Sub

Public Function CopyA(a() As Double) As Variant
    Dim b() As Double, i As Long
    ReDim b(0 To A_LAST)
    For i = 0 To A_LAST
        b(i) = a(i)
    Next i
    CopyA = b
End Function

Public Function WithValue(a() As Double, ByVal key As Long, ByVal value As Double) As Variant
    Dim b() As Double
    b = CopyA(a)
    b(key) = value
    WithValue = b
End Function

' ---------------------------------------------------------------- kosten van de installatie

Public Function PerKwEur(a() As Double) As Double
    PerKwEur = (a(A_OFFERTE_MEUR) - a(A_OFFERTE_MODULES) * a(A_VASTE_KOSTEN_MODULE_MEUR)) * 1000000# / (a(A_OFFERTE_MW) * 1000#)
End Function

Public Function CapexEur(a() As Double, ByVal n As Long) As Double
    CapexEur = PerKwEur(a) * a(A_CAPACITEIT_MW) * 1000# + n * a(A_VASTE_KOSTEN_MODULE_MEUR) * 1000000#
End Function

' ---------------------------------------------------------------- module

Public Function StackSecFull(a() As Double) As Double
    StackSecFull = a(A_SYSTEEMVERBRUIK_VOL) * (1 - a(A_FARADAYVERLIES_10) * 0.1) / (1 + a(A_BOP_VARIABEL) + a(A_BOP_VAST))
End Function

Public Function Degradation(a() As Double) As Double
    Degradation = a(A_DEGRADATIE_JAAR) * a(A_DEGRADATIE_JAREN) / 2
End Function

Public Function StackKgH(ByVal stack_mw As Double, ByVal size_mw As Double, a() As Double) As Double
    Dim x As Double, faraday As Double, sec As Double
    x = stack_mw / size_mw
    If x <= 0 Or x < a(A_MINIMUMLAST) - 0.000000001 Then
        StackKgH = 0#
        Exit Function
    End If
    faraday = MaxD(0#, 1 - a(A_FARADAYVERLIES_10) * 0.1 / x)
    sec = StackSecFull(a) * (1 - a(A_DEELLASTVOORDEEL) * (1 - x)) * (1 + Degradation(a))
    StackKgH = stack_mw * 1000 / sec * faraday
End Function

Public Function DrawMw(ByVal stack_mw As Double, ByVal size_mw As Double, a() As Double) As Double
    DrawMw = stack_mw * (1 + a(A_BOP_VARIABEL)) + a(A_BOP_VAST) * size_mw
End Function

Private Function EqualShare(ByVal power As Double, ByVal k As Long, ByVal size As Double, a() As Double) As Double
    EqualShare = MinD(size, (power / k - a(A_BOP_VAST) * size) / (1 + a(A_BOP_VARIABEL)))
End Function

' memo(index van round(power, 2), n_avail) = beste k, -1 = nog niet berekend. Zoals in Python wint de eerste aanroep:
' fits komt uit het onafgeronde aanbod.
Private Function DesiredCount(ByVal power As Double, ByVal n_avail As Long, ByVal size As Double, a() As Double, _
                              ByVal strategy As String, memo() As Long, ByVal minimum As Double, ByVal full As Double) As Long
    Dim fits As Long, idx As Long, k As Long, best As Double, best_k As Long, kg As Double, p2 As Double
    If minimum > 0 Then fits = MinL(n_avail, CLng(Floor(power / minimum))) Else fits = n_avail
    If strategy = "samen" Then
        If fits >= n_avail And n_avail > 0 Then DesiredCount = n_avail Else DesiredCount = 0
        Exit Function
    End If
    If strategy = "bijschakelen" Then
        If power >= minimum Then DesiredCount = MinL(fits, CLng(Ceil(power / full))) Else DesiredCount = 0
        Exit Function
    End If
    idx = Round2Index(power)
    If memo(idx, n_avail) < 0 Then
        p2 = idx / 100#
        best = 0#: best_k = 0
        For k = 1 To fits
            kg = k * StackKgH(EqualShare(p2, k, size, a), size, a)
            If kg > best + 0.000000001 Then
                best = kg: best_k = k
            End If
        Next k
        memo(idx, n_avail) = best_k
    End If
    DesiredCount = memo(idx, n_avail)
End Function

Private Function SequentialLoads(ByVal power As Double, ByVal k As Long, ByVal size As Double, a() As Double, loads() As Double) As Long
    ' Stackvermogen per module bij bijschakelen; geeft het aantal waarden in loads(0 .. k - 1).
    Dim full As Double, minimum As Double, total As Double, j As Long
    Dim draws() As Double
    full = DrawMw(size, size, a)
    minimum = DrawMw(a(A_MINIMUMLAST) * size, size, a)
    If minimum > 0 Then k = MinL(k, CLng(Floor(power / minimum)))
    If k <= 0 Then
        SequentialLoads = 0
        Exit Function
    End If
    total = MinD(power, k * full)
    ReDim draws(0 To k - 1)
    For j = 0 To k - 2
        draws(j) = full
    Next j
    draws(k - 1) = total - (k - 1) * full
    If k > 1 And draws(k - 1) < minimum Then
        draws(k - 2) = draws(k - 2) - (minimum - draws(k - 1))
        draws(k - 1) = minimum
    End If
    For j = 0 To k - 1
        loads(j) = MaxD(0#, MinD(size, (draws(j) - a(A_BOP_VAST) * size) / (1 + a(A_BOP_VARIABEL))))
    Next j
    SequentialLoads = k
End Function

Public Function StoringAvailability(a() As Double) As Double
    If a(A_STORINGEN_PER_JAAR) <= 0 Or a(A_HERSTELTIJD_UUR) <= 0 Then
        StoringAvailability = 1#
    Else
        StoringAvailability = MaxD(0#, 1 - a(A_STORINGEN_PER_JAAR) * a(A_HERSTELTIJD_UUR) / 8760)
    End If
End Function

Private Function StartupMin(ByVal heat As Double, a() As Double) As Double
    StartupMin = a(A_OPSTART_WARM_MIN) + (a(A_OPSTART_KOUD_MIN) - a(A_OPSTART_WARM_MIN)) * (1 - heat)
End Function

Private Sub SortStarters(list() As Long, ByVal count As Long, heat() As Double, eq() As Double, ByVal byHeat As Boolean)
    ' Stabiel invoegsorteren: op (-warmte, eq) of alleen op eq.
    Dim p As Long, q As Long, item As Long
    For p = 1 To count - 1
        item = list(p)
        q = p - 1
        Do While q >= 0
            If Not StarterBefore(item, list(q), heat, eq, byHeat) Then Exit Do
            list(q + 1) = list(q)
            q = q - 1
        Loop
        list(q + 1) = item
    Next p
End Sub

Private Function StarterBefore(ByVal i As Long, ByVal j As Long, heat() As Double, eq() As Double, ByVal byHeat As Boolean) As Boolean
    If byHeat Then
        If -heat(i) < -heat(j) Then
            StarterBefore = True
            Exit Function
        End If
        If -heat(i) > -heat(j) Then Exit Function
    End If
    StarterBefore = eq(i) < eq(j)
End Function

Private Sub SortRunning(list() As Long, ByVal count As Long, isMust() As Boolean, eq() As Double)
    ' Stabiel op (niet verplicht, eq): verplichte modules vooraan.
    Dim p As Long, q As Long, item As Long, before As Boolean
    For p = 1 To count - 1
        item = list(p)
        q = p - 1
        Do While q >= 0
            If isMust(item) <> isMust(list(q)) Then
                before = isMust(item)
            Else
                before = eq(item) < eq(list(q))
            End If
            If Not before Then Exit Do
            list(q + 1) = list(q)
            q = q - 1
        Loop
        list(q + 1) = item
    Next p
End Sub

' ---------------------------------------------------------------- simulatie

' Eén windjaar (of een venster daaruit) met n modules. Komt overeen met simulate() in opsplitsing.py.
' trFrom..trTo (0-gebaseerde tijdstappen) vullen het dagverloop; trFrom < 0 betekent geen dagverloop.
Public Function Simulate(t() As Double, mw() As Double, z() As Double, ByVal yr As Long, ByVal n As Long, a() As Double, _
                         ByVal strategy As String, ByVal standbyMode As String, ByVal trFrom As Long, ByVal trTo As Long) As Variant
    Dim cnt As Long, size As Double, min_on As Double, min_off As Double, delay As Double, minimum As Double, full As Double
    Dim want_h As Double, avail_f As Double, minLoad As Double
    Dim i As Long, j As Long, r As Long, st As Long, p As Long
    cnt = UBound(t) - LBound(t) + 1
    size = a(A_CAPACITEIT_MW) / n
    min_on = a(A_MIN_AAN_MIN) / 60: min_off = a(A_MIN_UIT_MIN) / 60: delay = a(A_STARTVERTRAGING_MIN) / 60
    minimum = DrawMw(a(A_MINIMUMLAST) * size, size, a)
    full = DrawMw(size, size, a)
    minLoad = a(A_MINIMUMLAST) * size - 0.000000001
    want_h = 0#
    avail_f = StoringAvailability(a)

    ' Gepland onderhoud: na elkaar vanaf half april (outages() in Python).
    Dim downLo() As Double, downHi() As Double, hasDown() As Boolean, startDay As Double
    ReDim downLo(0 To n - 1): ReDim downHi(0 To n - 1): ReDim hasDown(0 To n - 1)
    For i = 0 To n - 1
        If a(A_ONDERHOUD_DAGEN) > 0 Then
            startDay = 105 + FMod(i * a(A_ONDERHOUD_DAGEN), 150)
            downLo(i) = LocalToUnix(yr, startDay)
            downHi(i) = LocalToUnix(yr, startDay + a(A_ONDERHOUD_DAGEN))
            hasDown(i) = True
        End If
    Next i

    Dim isOn() As Boolean, on_h() As Double, off_h() As Double, startup() As Double, eq() As Double, hours() As Double
    Dim warm() As Double, cold() As Double, heat() As Double, hot_h() As Double, down() As Boolean, isMust() As Boolean
    ReDim isOn(0 To n - 1): ReDim on_h(0 To n - 1): ReDim off_h(0 To n - 1): ReDim startup(0 To n - 1)
    ReDim eq(0 To n - 1): ReDim hours(0 To n - 1): ReDim warm(0 To n - 1): ReDim cold(0 To n - 1)
    ReDim heat(0 To n - 1): ReDim hot_h(0 To n - 1): ReDim down(0 To n - 1): ReDim isMust(0 To n - 1)
    For i = 0 To n - 1
        off_h(i) = a(A_KOUD_NA_UUR) + min_off   ' het jaar begint koud
    Next i
    Dim kg As Double, used As Double, standby As Double, producing As Double
    Dim avail() As Long, running() As Long, must() As Long, starters() As Long, chosen() As Long
    ReDim avail(0 To n - 1): ReDim running(0 To n - 1): ReDim must(0 To n - 1): ReDim starters(0 To n - 1): ReDim chosen(0 To n - 1)
    Dim loads() As Double, seq() As Double, module_kg() As Double, starting() As Double, state() As String
    ReDim loads(0 To n - 1): ReDim seq(0 To n - 1): ReDim module_kg(0 To n - 1): ReDim starting(0 To n - 1): ReDim state(0 To n - 1)
    Dim nAvail As Long, nRun As Long, nMust As Long, nStart As Long, nRest As Long, nChosen As Long, nKeep As Long
    Dim fits As Long, k As Long, wanted As Long, waiting As Boolean
    Dim stamp As Double, power As Double

    ' Daggetallen; de reeks loopt in de tijd, dus een nieuwe dag begint als de datum verandert.
    Dim dayDate() As Long, dayKg() As Double, dayOut() As Boolean, nDays As Long, today As Long
    ReDim dayDate(0 To 399): ReDim dayKg(0 To 399): ReDim dayOut(0 To 399)
    nDays = 0

    ' Memo voor DesiredCount: tot het hoogste (voorspelde) aanbod in honderdsten.
    Dim memo() As Long, maxPower As Double
    maxPower = 0
    For st = 0 To cnt - 1
        If mw(st) > maxPower Then maxPower = mw(st)
    Next st

    ' Stand-by met voorspelling.
    Dim predict As Boolean, horizon_s As Double, avoided As Double, blocked_before As Long, tau As Double, cool_step As Double
    Dim fc() As Double, kf() As Long, needAt() As Long, endAt() As Long
    predict = (standbyMode = "voorspelling")
    horizon_s = a(A_VOORUITKIJK_UUR) * 3600
    avoided = 0: blocked_before = 0
    If predict Then
        tau = a(A_KOUD_NA_UUR) / 3
        If tau > 0 Then cool_step = Exp(-STEP_H / tau) Else cool_step = 0#
        fc = Forecast(t, mw, z, a(A_VOORSPELFOUT))
        For st = 0 To cnt - 1
            If fc(st) > maxPower Then maxPower = fc(st)
        Next st
    End If
    ReDim memo(0 To Round2Index(maxPower) + 2, 0 To n)
    For i = 0 To UBound(memo, 1)
        For j = 0 To n
            memo(i, j) = -1
        Next j
    Next i
    If predict Then
        ReDim kf(0 To cnt - 1)
        For st = 0 To cnt - 1
            p = 0
            For i = 0 To n - 1
                If Not IsDown(t(st), i, hasDown, downLo, downHi) Then p = p + 1
            Next i
            kf(st) = DesiredCount(fc(st), p, size, a, strategy, memo, minimum, full)
        Next st
        ' need_tables(): eerste stap vanaf j waarop de voorspelling >= r modules wil, en waarop ze < r wil.
        ReDim needAt(1 To n, 0 To cnt): ReDim endAt(1 To n, 0 To cnt)
        For r = 1 To n
            needAt(r, cnt) = cnt: endAt(r, cnt) = cnt
            For j = cnt - 1 To 0 Step -1
                If kf(j) >= r Then
                    needAt(r, j) = j: endAt(r, j) = endAt(r, j + 1)
                Else
                    needAt(r, j) = needAt(r, j + 1): endAt(r, j) = j
                End If
            Next j
        Next r
    End If

    ' Dagverloop.
    Dim tracing As Boolean, trace As Variant, tr As Long, reasons As String, rank() As Long
    Dim blockedR() As Long, blockedAhead() As Double, blockedNeeded() As Double, nBlocked As Long
    ReDim rank(0 To n - 1)
    ReDim blockedR(0 To n): ReDim blockedAhead(0 To n): ReDim blockedNeeded(0 To n)
    tracing = trFrom >= 0
    If tracing Then
        Dim traceArr() As Variant
        ReDim traceArr(0 To trTo - trFrom, 0 To TR_MODULES + TR_PER_MODULE * n - 1)
    End If

    Dim allowed As Long, upper As Long, needed As Double, ahead As Double, blocked_count As Long, producing_now As Long
    Dim nIdle As Long, idle() As Long, productive As Double, step_kg As Double, keep_warm As Boolean, gap As Double
    Dim gap_h As Double, hold As Double, cooled As Double, lost_h As Double, drawNow As Double, producers As Long
    ReDim idle(0 To n - 1)

    For st = 0 To cnt - 1
        stamp = t(st): power = mw(st)
        nAvail = 0: nRun = 0: nMust = 0: nStart = 0: nRest = 0
        For i = 0 To n - 1
            down(i) = IsDown(stamp, i, hasDown, downLo, downHi)
            isMust(i) = False
            If Not down(i) Then
                avail(nAvail) = i: nAvail = nAvail + 1
                If isOn(i) Then
                    running(nRun) = i: nRun = nRun + 1
                    If on_h(i) < min_on Then
                        must(nMust) = i: nMust = nMust + 1: isMust(i) = True
                    End If
                ElseIf off_h(i) >= min_off Then
                    starters(nStart) = i: nStart = nStart + 1
                Else
                    nRest = nRest + 1
                End If
            End If
        Next i
        If minimum > 0 Then fits = MinL(nAvail, CLng(Floor(power / minimum))) Else fits = nAvail
        k = DesiredCount(power, nAvail, size, a, strategy, memo, minimum, full)
        wanted = k
        If k > nRun Then want_h = want_h + STEP_H Else want_h = 0#
        nBlocked = 0
        If predict Then
            ' Geen startvertraging: module r start als de voorspelling vanaf de volgende stap minstens de minimale aan-tijd
            ' plus de opstarttijd genoeg wind voor r modules geeft. Warme modules gaan voor.
            waiting = False
            SortStarters starters, nStart, heat, eq, True
            allowed = nRun
            upper = MinL(k, nRun + nStart)
            For r = nRun + 1 To upper
                i = starters(r - nRun - 1)
                needed = (min_on + StartupMin(heat(i), a) / 60) * 3600
                If st + 1 < cnt Then ahead = SecondsUntil(endAt(r, st + 1), stamp, t, cnt) Else ahead = 0#
                If ahead < needed - 0.000001 Then
                    blockedR(nBlocked) = r: blockedAhead(nBlocked) = ahead: blockedNeeded(nBlocked) = needed
                    nBlocked = nBlocked + 1
                    Exit For
                End If
                allowed = r
            Next r
            blocked_count = MaxL(0, upper - allowed)
            avoided = avoided + MaxL(0, blocked_count - blocked_before)
            blocked_before = blocked_count
            nStart = allowed - nRun
        Else
            waiting = nStart > 0 And want_h < delay - 0.000000001
        End If
        If waiting Then nStart = 0
        k = MaxL(MinL(k, nRun + nStart), MinL(nMust, fits))
        k = MinL(MinL(k, fits), nRun + nStart)
        ' Lopende modules eerst (verplichte vooraan), bij starten de minst versleten.
        SortRunning running, nRun, isMust, eq
        nKeep = MinL(k, nRun)
        For p = 0 To nKeep - 1
            chosen(p) = running(p)
        Next p
        If Not predict Then SortStarters starters, nStart, heat, eq, False
        nChosen = nKeep
        For p = 0 To k - nKeep - 1
            chosen(nChosen) = starters(p): nChosen = nChosen + 1
        Next p
        For i = 0 To n - 1
            loads(i) = 0#
        Next i
        If strategy = "bijschakelen" Then
            p = SequentialLoads(power, nChosen, size, a, seq)
            For j = 0 To p - 1
                loads(chosen(j)) = seq(j)
            Next j
        ElseIf nChosen > 0 Then
            drawNow = EqualShare(power, nChosen, size, a)
            For j = 0 To nChosen - 1
                loads(chosen(j)) = drawNow
            Next j
        End If
        step_kg = 0#
        If predict Then
            ' Rang bij de volgende start: na de draaiende modules, de warmste eerst.
            producing_now = 0: nIdle = 0
            For i = 0 To n - 1
                If loads(i) >= minLoad And loads(i) > 0 Then
                    producing_now = producing_now + 1
                ElseIf Not down(i) Then
                    idle(nIdle) = i: nIdle = nIdle + 1
                End If
            Next i
            SortStarters idle, nIdle, heat, eq, True
            For p = 0 To nIdle - 1
                rank(idle(p)) = producing_now + 1 + p
            Next p
        End If
        For i = 0 To n - 1
            module_kg(i) = 0#: starting(i) = 0#: state(i) = ""
            If loads(i) >= minLoad And loads(i) > 0 Then
                If Not isOn(i) Then
                    If predict Then
                        startup(i) = StartupMin(heat(i), a)
                        If heat(i) >= 0.5 Then warm(i) = warm(i) + 1 Else cold(i) = cold(i) + 1
                    ElseIf off_h(i) >= a(A_KOUD_NA_UUR) Then
                        cold(i) = cold(i) + 1: startup(i) = a(A_OPSTART_KOUD_MIN)
                    Else
                        warm(i) = warm(i) + 1: startup(i) = a(A_OPSTART_WARM_MIN)
                    End If
                    isOn(i) = True: on_h(i) = 0#
                End If
                heat(i) = 1#
                state(i) = "draait"
                productive = MaxD(0#, 10 - startup(i)) / 10
                starting(i) = MinD(10#, startup(i))
                startup(i) = MaxD(0#, startup(i) - 10)
                module_kg(i) = StackKgH(loads(i), size, a) * STEP_H * productive
                step_kg = step_kg + module_kg(i)
                used = used + DrawMw(loads(i), size, a) * STEP_H
                eq(i) = eq(i) + STEP_H
                hours(i) = hours(i) + STEP_H
                on_h(i) = on_h(i) + STEP_H
            Else
                If isOn(i) Then
                    isOn(i) = False: off_h(i) = 0#
                End If
                If predict Then
                    keep_warm = False
                    If Not down(i) And heat(i) > 0.01 And st + 1 < cnt Then
                        j = needAt(rank(i), st + 1)
                        gap = SecondsUntil(j, stamp, t, cnt)
                        If gap <= horizon_s Then
                            ' Warmhouden tot de volgende start tegen het extra opstartverlies als de module tot dan afkoelt.
                            gap_h = gap / 3600
                            hold = a(A_STANDBY) * size * gap_h
                            If tau > 0 Then cooled = heat(i) * Exp(-gap_h / tau) Else cooled = 0#
                            lost_h = (StartupMin(cooled, a) - StartupMin(heat(i), a)) / 60
                            drawNow = MinD(full, fc(j) / MaxL(kf(j), 1))
                            keep_warm = hold < lost_h * drawNow
                        End If
                    End If
                    If keep_warm Then
                        standby = standby + a(A_STANDBY) * size * STEP_H
                        hot_h(i) = hot_h(i) + STEP_H
                        state(i) = "warm"
                    Else
                        heat(i) = heat(i) * cool_step
                        If down(i) Then state(i) = "onderhoud" Else state(i) = "koelt af"
                    End If
                ElseIf Not down(i) And off_h(i) < a(A_KOUD_NA_UUR) Then
                    standby = standby + a(A_STANDBY) * size * STEP_H
                End If
                off_h(i) = off_h(i) + STEP_H
            End If
        Next i
        kg = kg + step_kg
        ' Verwachte productietijd: de stap valt pas weg als alle producerende modules tegelijk in storing zijn.
        producers = 0
        For i = 0 To n - 1
            If module_kg(i) > 0 Then producers = producers + 1
        Next i
        If producers > 0 Then producing = producing + STEP_H * (1 - (1 - avail_f) ^ producers)
        today = LocalDay(stamp)
        If nDays = 0 Then
            nDays = 1: dayDate(0) = today
        ElseIf dayDate(nDays - 1) <> today Then
            If nDays > UBound(dayDate) Then
                ReDim Preserve dayDate(0 To nDays + 100): ReDim Preserve dayKg(0 To nDays + 100): ReDim Preserve dayOut(0 To nDays + 100)
            End If
            dayDate(nDays) = today: nDays = nDays + 1
        End If
        dayKg(nDays - 1) = dayKg(nDays - 1) + step_kg
        If nAvail < n Then dayOut(nDays - 1) = True
        If tracing Then
            If st >= trFrom And st <= trTo Then
                tr = st - trFrom
                reasons = ""
                If waiting And wanted > nRun Then reasons = AddReason(reasons, "startvertraging: al " & CLng(PyRound(want_h * 60, 0)) & " van " & CLng(PyRound(a(A_STARTVERTRAGING_MIN), 0)) & " min genoeg wind")
                If nRest > 0 And wanted > nRun + nStart Then reasons = AddReason(reasons, nRest & " net gestopt, minimale uit-tijd")
                If nMust > wanted And k > wanted Then reasons = AddReason(reasons, nMust & " houden minimale aan-tijd vast")
                If nAvail < n Then reasons = AddReason(reasons, (n - nAvail) & " in onderhoud")
                If predict Then
                    For p = 0 To nBlocked - 1
                        reasons = AddReason(reasons, "module " & blockedR(p) & " niet gestart: voorspelling geeft nog " & CLng(PyRound(blockedAhead(p) / 60, 0)) & _
                                            " min wind voor " & blockedR(p) & " modules, nodig " & CLng(PyRound(blockedNeeded(p) / 60, 0)) & " min (minimale aan-tijd + opstarten)")
                    Next p
                    p = 0
                    For i = 0 To n - 1
                        If state(i) = "warm" Then p = p + 1
                    Next i
                    If p > 0 Then reasons = AddReason(reasons, p & " warm gehouden: volgens de voorspelling binnenkort weer nodig")
                    traceArr(tr, TR_VOORSPELLING) = PyRound(fc(st), 3)
                    traceArr(tr, TR_VOORSPELD_GEWENST) = kf(st)
                End If
                traceArr(tr, TR_T) = stamp
                traceArr(tr, TR_AANBOD) = power
                drawNow = 0#
                For i = 0 To n - 1
                    If loads(i) > 0 Then drawNow = drawNow + DrawMw(loads(i), size, a)
                Next i
                traceArr(tr, TR_VERBRUIK) = PyRound(drawNow, 3)
                traceArr(tr, TR_GEWENST) = wanted
                traceArr(tr, TR_PASSEN) = fits
                traceArr(tr, TR_REDENEN) = reasons
                For i = 0 To n - 1
                    j = TR_MODULES + TR_PER_MODULE * i
                    traceArr(tr, j + TRM_STACK) = PyRound(loads(i), 3)
                    traceArr(tr, j + TRM_KG) = PyRound(module_kg(i), 3)
                    traceArr(tr, j + TRM_OPSTART) = starting(i)
                    traceArr(tr, j + TRM_UIT) = down(i)
                    If predict Then
                        traceArr(tr, j + TRM_WARMTE) = PyRound(heat(i), 2)
                        traceArr(tr, j + TRM_TOESTAND) = state(i)
                    End If
                Next i
            End If
        End If
    Next st

    Dim yrScale As Double, supply_mwh As Double, sumH As Double, sumWarm As Double, sumCold As Double, sumHot As Double
    If cnt > 0 Then yrScale = 8760 / (cnt * STEP_H) Else yrScale = 0
    supply_mwh = 0#
    For st = 0 To cnt - 1
        supply_mwh = supply_mwh + mw(st)
    Next st
    supply_mwh = supply_mwh * STEP_H
    ' Storingen: elke module levert, verbruikt en slijt een vast deel minder. Daggetallen en dagverloop blijven zonder deze afslag.
    kg = kg * avail_f: used = used * avail_f: standby = standby * avail_f
    Dim eqOut() As Double
    ReDim eqOut(0 To n - 1)
    sumH = 0: sumWarm = 0: sumCold = 0: sumHot = 0
    For i = 0 To n - 1
        sumH = sumH + hours(i) * avail_f
        sumWarm = sumWarm + warm(i) * avail_f
        sumCold = sumCold + cold(i) * avail_f
        sumHot = sumHot + hot_h(i)
        eqOut(i) = eq(i) * avail_f * yrScale
    Next i

    Dim res() As Variant
    ReDim res(0 To X_LAST)
    res(R_MODULES) = n
    res(R_MODULE_MW) = size
    res(R_STRATEGIE) = strategy
    res(R_JAAR) = yr
    res(R_WATERSTOF_T) = kg * yrScale / 1000
    res(R_VERBRUIK_MWH) = used * yrScale
    res(R_STANDBY_MWH) = standby * yrScale
    res(R_AANBOD_MWH) = supply_mwh * yrScale
    If supply_mwh <> 0 Then res(R_BENUTTING) = used / supply_mwh Else res(R_BENUTTING) = 0#
    res(R_BEDRIJFSUREN_GEM) = sumH / n * yrScale
    res(R_PRODUCTIE_UUR) = producing * yrScale
    res(R_STARTS_WARM) = sumWarm / n * yrScale
    res(R_STARTS_KOUD) = sumCold / n * yrScale
    res(R_STANDBYBELEID) = standbyMode
    res(R_STANDBY_UUR) = sumHot * avail_f / n * yrScale
    res(R_STARTS_VERMEDEN) = avoided * avail_f / n * yrScale
    res(R_EQ_UREN) = eqOut
    res(R_DEKKING_UUR) = cnt * STEP_H
    res(R_BESCHIKBAARHEID) = avail_f
    If nDays > 0 Then
        ReDim Preserve dayDate(0 To nDays - 1): ReDim Preserve dayKg(0 To nDays - 1): ReDim Preserve dayOut(0 To nDays - 1)
        For p = 0 To nDays - 1
            dayKg(p) = PyRound(dayKg(p), 1)
        Next p
    End If
    res(R_DAG_DATUM) = dayDate
    res(R_DAG_KG) = dayKg
    res(R_DAG_UIT) = dayOut
    If tracing Then res(R_STAPPEN) = traceArr
    res(R_STACKWISSEL_DAGEN) = 0#
    Simulate = res
End Function

Private Function AddReason(ByVal txt As String, ByVal reason As String) As String
    If Len(txt) > 0 Then AddReason = txt & "; " & reason Else AddReason = reason
End Function

Private Function IsDown(ByVal stamp As Double, ByVal i As Long, hasDown() As Boolean, lo() As Double, hi() As Double) As Boolean
    If hasDown(i) Then IsDown = (lo(i) <= stamp And stamp < hi(i))
End Function

Private Function SecondsUntil(ByVal j As Long, ByVal stamp As Double, t() As Double, ByVal cnt As Long) As Double
    If j < cnt Then SecondsUntil = t(j) - stamp Else SecondsUntil = 1E+300
End Function

Public Function Forecast(t() As Double, mw() As Double, z() As Double, ByVal fout As Double) As Variant
    ' Voorspeld aanbod: het uurgemiddelde × (1 + fout · z), nooit onder nul. z hangt alleen van jaar, dag en uur af en staat
    ' in Data_Aanbod (zelfde trekkingen als random.Random in Python).
    Dim cnt As Long, out() As Double, s As Long, e As Long, hr As Double, total As Double, f As Double, q As Long, zz As Double
    cnt = UBound(t) - LBound(t) + 1
    ReDim out(0 To cnt - 1)
    s = 0
    Do While s < cnt
        hr = Int(t(s) / 3600#)
        e = s: total = 0#
        Do While e < cnt
            If Int(t(e) / 3600#) <> hr Then Exit Do
            total = total + mw(e)
            e = e + 1
        Loop
        If fout <> 0 Then zz = z(s) Else zz = 0#
        f = MaxD(0#, total / (e - s) * (1 + fout * zz))
        For q = s To e - 1
            out(q) = f
        Next q
        s = e
    Loop
    Forecast = out
End Function

Public Function ReplacementDays(res As Variant, a() As Double) As Double
    Dim eq As Variant, wear As Double, i As Long
    eq = res(R_EQ_UREN)
    wear = 0
    For i = LBound(eq) To UBound(eq)
        wear = wear + eq(i)
    Next i
    wear = wear / res(R_MODULES)
    ReplacementDays = a(A_STACKWISSEL_WEKEN) * 7 * wear / a(A_STACK_LEVENSDUUR_UUR)
End Function

' simulate_with_replacements(): eerst de slijtage meten, dan opnieuw met de stilstand voor stackwissels.
Public Function SimulateYear(ByVal yr As Long, ByVal parks As Long, ByVal n As Long, a() As Double, ByVal strategy As String, _
                             ByVal standbyMode As String) As Variant
    Dim key As String, res As Variant, first As Variant, days As Double, y As Long, b() As Double, i As Long
    Dim t() As Double, mw() As Double, z() As Double
    EnsureData
    key = CacheKey(yr, parks, n, a, strategy, standbyMode)
    For i = gCacheCount - 1 To 0 Step -1
        If gCacheKeys(i) = key Then
            CacheHits = CacheHits + 1
            SimulateYear = gCacheValues(i)
            Exit Function
        End If
    Next i
    CacheMisses = CacheMisses + 1
    y = YearIndex(yr)
    t = gT(y): z = gZ(y): mw = gMW(y, parks)
    first = Simulate(t, mw, z, yr, n, a, strategy, standbyMode, -1, -1)
    If a(A_STACKWISSEL_WEKEN) <> 0 Then days = ReplacementDays(first, a) Else days = 0#
    If days = 0 Then
        res = first
        res(R_STACKWISSEL_DAGEN) = 0#
    Else
        b = WithValue(a, A_ONDERHOUD_DAGEN, a(A_ONDERHOUD_DAGEN) + days)
        res = Simulate(t, mw, z, yr, n, b, strategy, standbyMode, -1, -1)
        res(R_STACKWISSEL_DAGEN) = days
    End If
    If gCacheCount >= CACHE_LIMIT Then
        ' Vol: de oudste helft vergeten.
        For i = 0 To CACHE_LIMIT \ 2 - 1
            gCacheKeys(i) = gCacheKeys(i + CACHE_LIMIT \ 2)
            gCacheValues(i) = gCacheValues(i + CACHE_LIMIT \ 2)
        Next i
        gCacheCount = CACHE_LIMIT \ 2
    End If
    gCacheKeys(gCacheCount) = key
    gCacheValues(gCacheCount) = res
    gCacheCount = gCacheCount + 1
    SimulateYear = res
End Function

Private Function CacheKey(ByVal yr As Long, ByVal parks As Long, ByVal n As Long, a() As Double, ByVal strategy As String, _
                          ByVal standbyMode As String) As String
    Dim s As String, i As Long
    s = MODEL_VERSION & "|" & yr & "|" & parks & "|" & n & "|" & strategy & "|" & standbyMode
    For i = 0 To SIM_FIELDS_LAST
        s = s & "|" & CStr(a(i))
    Next i
    CacheKey = s
End Function

' ---------------------------------------------------------------- kosten

Public Function PowerPrice(a() As Double) As Double
    Dim levies As Double
    levies = MaxD(0#, a(A_NETKOSTEN_EUR_MWH) + a(A_BELASTING_EUR_MWH) - a(A_KORTING_NET_BELASTING_EUR_MWH))
    PowerPrice = a(A_STROOMPRIJS_EUR_MWH) + levies
End Function

Public Function SubsidyEur(a() As Double) As Double
    SubsidyEur = a(A_CAPEX_SUBSIDIE_EUR_KW) * a(A_CAPACITEIT_MW) * 1000
End Function

Public Function RevenueEurKg(a() As Double) As Double
    RevenueEurKg = a(A_WATERSTOFPREMIE_EUR_KG) + a(A_ZUURSTOFPRIJS_EUR_T) * OXYGEN_KG_PER_KG / 1000
End Function

Public Function Crf(a() As Double) As Double
    If a(A_RENTE) <> 0 Then
        Crf = a(A_RENTE) / (1 - (1 + a(A_RENTE)) ^ (-a(A_LOOPTIJD_JAAR)))
    Else
        Crf = 1 / a(A_LOOPTIJD_JAAR)
    End If
End Function

' economics(): vult de kostenvelden X_CAPEX_MEUR .. X_PRIJS_PER_KW van res.
Public Sub Economics(res As Variant, a() As Double)
    Dim n As Long, capex As Double, module_capex As Double, stack As Double, power As Double, annual As Double, kg As Double
    Dim eq As Variant, i As Long, maxWear As Double, anyWear As Boolean
    n = res(R_MODULES)
    capex = CapexEur(a, n)
    module_capex = capex / n
    eq = res(R_EQ_UREN)
    stack = 0
    For i = LBound(eq) To UBound(eq)
        stack = stack + a(A_STACK_AANDEEL) * module_capex * eq(i) / a(A_STACK_LEVENSDUUR_UUR)
        If eq(i) <> 0 Then
            If Not anyWear Or eq(i) > maxWear Then maxWear = eq(i)
            anyWear = True
        End If
    Next i
    power = (res(R_VERBRUIK_MWH) + res(R_STANDBY_MWH)) * PowerPrice(a)
    annual = (capex - SubsidyEur(a)) * Crf(a) + a(A_OPEX_AANDEEL) * capex + stack + power
    kg = res(R_WATERSTOF_T) * 1000
    res(X_CAPEX_MEUR) = capex / 1000000#
    res(X_STACK_MEUR_JAAR) = stack / 1000000#
    res(X_KOSTEN_MEUR_JAAR) = annual / 1000000#
    res(X_STROOM_MEUR_JAAR) = power / 1000000#
    res(X_KAPITAAL_MEUR_JAAR) = ((capex - SubsidyEur(a)) * Crf(a) + a(A_OPEX_AANDEEL) * capex) / 1000000#
    If kg <> 0 Then
        res(X_LCOH) = annual / kg
        res(X_NETTO) = annual / kg - RevenueEurKg(a)
    Else
        res(X_LCOH) = Empty
        res(X_NETTO) = Empty
    End If
    If anyWear Then res(X_JAREN_TOT_STACKWISSEL) = a(A_STACK_LEVENSDUUR_UUR) / maxWear Else res(X_JAREN_TOT_STACKWISSEL) = Empty
    res(X_PRIJS_PER_KW) = PerKwEur(a)
End Sub

Public Function CopyRow(v As Variant) As Variant
    ' Echte kopie van een uitkomst. (Excel kopieert arrays bij toewijzing al, LibreOffice niet.)
    Dim o() As Variant, i As Long
    ReDim o(LBound(v) To UBound(v))
    For i = LBound(v) To UBound(v)
        o(i) = v(i)
    Next i
    CopyRow = o
End Function

Private Function NewList(ByVal count As Long) As Variant
    Dim o() As Variant
    ReDim o(0 To count - 1)
    NewList = o
End Function

Public Function LcohOf(res As Variant, a() As Double) As Variant
    Dim copy As Variant
    copy = CopyRow(res)
    Economics copy, a
    LcohOf = copy(X_LCOH)
End Function

' summarise(): gemiddelde over windjaren plus kosten en de uitkomst per jaar.
Public Function Summarise(perYear As Variant, a() As Double) As Variant
    Dim out As Variant, cntY As Long, y As Long, f As Long, i As Long, n As Long, eq() As Double, e As Variant
    Dim years() As Variant, one As Variant
    cntY = UBound(perYear) - LBound(perYear) + 1
    out = CopyRow(perYear(LBound(perYear)))
    n = out(R_MODULES)
    For f = 0 To R_STACKWISSEL_DAGEN
        Select Case f
            Case R_MODULES, R_STRATEGIE, R_JAAR, R_STANDBYBELEID, R_DAG_DATUM, R_DAG_KG, R_DAG_UIT, R_STAPPEN
            Case R_EQ_UREN
                ReDim eq(0 To n - 1)
                For i = 0 To n - 1
                    eq(i) = 0
                    For y = LBound(perYear) To UBound(perYear)
                        e = perYear(y)(R_EQ_UREN)
                        eq(i) = eq(i) + e(i)
                    Next y
                    eq(i) = eq(i) / cntY
                Next i
                out(R_EQ_UREN) = eq
            Case Else
                out(f) = 0#
                For y = LBound(perYear) To UBound(perYear)
                    out(f) = out(f) + perYear(y)(f)
                Next y
                out(f) = out(f) / cntY
        End Select
    Next f
    out(R_DAG_DATUM) = Empty: out(R_DAG_KG) = Empty: out(R_DAG_UIT) = Empty: out(R_STAPPEN) = Empty: out(R_JAAR) = Empty
    Economics out, a
    ReDim years(0 To cntY - 1)
    For y = LBound(perYear) To UBound(perYear)
        one = CopyRow(perYear(y))
        Economics one, a
        years(y - LBound(perYear)) = Array(one(R_JAAR), one(R_WATERSTOF_T), one(X_LCOH), one(X_NETTO))
    Next y
    out(X_JAREN) = years
    Summarise = out
End Function

' break_even() voor de rijen (één per moduleaantal, oplopend); rij 0 is de vergelijkingsbasis.
Public Sub BreakEven(rows As Variant, a() As Double)
    Dim r As Long, ref1 As Variant, row As Variant, prev As Variant, wear As Double, power As Double, target As Double
    Dim eq As Variant, i As Long, limit As Variant, extra_kg As Double, best As Long, bestL As Double, h1 As Double, hn As Double
    Dim k1 As Double, kn As Double, s1 As Double, sn As Double, e1 As Double, en As Double
    For r = LBound(rows) To UBound(rows)
        If IsEmpty(rows(r)(X_LCOH)) Then
            Err.Raise ERR_BASE + 10, , NoHydrogenMessage(rows)
        End If
    Next r
    ref1 = rows(LBound(rows))
    For r = LBound(rows) To UBound(rows)
        row = rows(r)
        eq = row(R_EQ_UREN)
        wear = 0
        For i = LBound(eq) To UBound(eq)
            wear = wear + eq(i)
        Next i
        wear = wear / row(R_MODULES) / a(A_STACK_LEVENSDUUR_UUR)
        power = (row(R_VERBRUIK_MWH) + row(R_STANDBY_MWH)) * PowerPrice(a)
        target = ref1(X_LCOH) * row(R_WATERSTOF_T) * 1000
        row(X_CAPEX_BREAK_EVEN) = ((target - power + SubsidyEur(a) * Crf(a)) / (Crf(a) + a(A_OPEX_AANDEEL) + a(A_STACK_AANDEEL) * wear) / 1000000#)
        If r = LBound(rows) Then
            row(X_VASTE_KOSTEN_BREAK_EVEN) = Empty
            row(X_OPSPLITSEN) = Empty
        Else
            limit = FixedCostBreakEven(ref1, row, a)
            row(X_VASTE_KOSTEN_BREAK_EVEN) = limit
            If Not IsEmpty(limit) Then
                If limit >= 0.005 Then row(X_OPSPLITSEN) = "loont" Else row(X_OPSPLITSEN) = "loont_niet"
            Else
                row(X_OPSPLITSEN) = "loont_niet"
            End If
            ' Uitsplitsing van het verschil in kosten per kilo met de eerste configuratie.
            h1 = ref1(R_WATERSTOF_T) * 1000: hn = row(R_WATERSTOF_T) * 1000
            k1 = ref1(X_KAPITAAL_MEUR_JAAR) * 1000000#: kn = row(X_KAPITAAL_MEUR_JAAR) * 1000000#
            s1 = ref1(X_STACK_MEUR_JAAR) * 1000000#: sn = row(X_STACK_MEUR_JAAR) * 1000000#
            e1 = ref1(X_STROOM_MEUR_JAAR) * 1000000#: en = row(X_STROOM_MEUR_JAAR) * 1000000#
            row(X_D_MEER_WATERSTOF) = (k1 + s1) * (1 / hn - 1 / h1)
            row(X_D_DUURDERE_INSTALLATIE) = (kn - k1) / hn
            row(X_D_STROOM_PER_KILO) = en / hn - e1 / h1
            row(X_D_STACKVERVANGING) = (sn - s1) / hn
            row(X_D_KWH_EEN) = (ref1(R_VERBRUIK_MWH) + ref1(R_STANDBY_MWH)) * 1000 / (ref1(R_WATERSTOF_T) * 1000)
            row(X_D_KWH_DEZE) = (row(R_VERBRUIK_MWH) + row(R_STANDBY_MWH)) * 1000 / (row(R_WATERSTOF_T) * 1000)
        End If
        If r > LBound(rows) Then
            row(X_EXTRA_WATERSTOF) = row(R_WATERSTOF_T) - prev(R_WATERSTOF_T)
            row(X_EXTRA_KOSTEN) = row(X_KOSTEN_MEUR_JAAR) - prev(X_KOSTEN_MEUR_JAAR)
            row(X_EXTRA_PRODUCTIE_UUR) = row(R_PRODUCTIE_UUR) - prev(R_PRODUCTIE_UUR)
            extra_kg = row(X_EXTRA_WATERSTOF) * 1000
            If extra_kg > 0 Then row(X_MARGINAAL) = row(X_EXTRA_KOSTEN) * 1000000# / extra_kg Else row(X_MARGINAAL) = Empty
            row(X_STAP_LOONT) = row(X_LCOH) < prev(X_LCOH)
        End If
        rows(r) = row
        prev = row
    Next r
    best = LBound(rows): bestL = rows(best)(X_LCOH)
    For r = LBound(rows) To UBound(rows)
        If rows(r)(X_LCOH) < bestL Then
            best = r: bestL = rows(r)(X_LCOH)
        End If
    Next r
    For r = LBound(rows) To UBound(rows)
        row = rows(r)
        row(X_BESTE) = (r = best)
        rows(r) = row
    Next r
End Sub

Private Function NoHydrogenMessage(rows As Variant) As String
    Dim names As String, r As Long, list() As Long, c As Long
    ReDim list(0 To UBound(rows) - LBound(rows))
    For r = LBound(rows) To UBound(rows)
        If rows(r)(R_WATERSTOF_T) <= 0 Then
            list(c) = rows(r)(R_MODULES): c = c + 1
        End If
    Next r
    NoHydrogenMessage = NoHydrogenText(list, c)
End Function

Public Function NoHydrogenText(list() As Long, ByVal c As Long) As String
    Dim names As String, r As Long
    If c = 1 And list(0) = 1 Then
        names = "maakt 1 module"
    ElseIf c = 1 Then
        names = "maken " & list(0) & " modules"
    Else
        For r = 0 To c - 2
            If r > 0 Then names = names & ", "
            names = names & list(r)
        Next r
        names = "maken " & names & " en " & list(c - 1) & " modules"
    End If
    NoHydrogenText = "Met dit aanbod " & names & " geen waterstof: het aanbod komt nooit boven de minimumlast. " & _
                     "Kies andere moduleaantallen, een lagere minimumlast of meer windparken."
End Function

Private Function FixedCostBreakEven(ref1 As Variant, row As Variant, a() As Double) As Variant
    ' Vaste kosten per module (M€) waarbij deze configuratie even duur per kilo is als de eerste; lineair, dus twee punten.
    Dim g0 As Double, g1 As Double, slope As Double, a0() As Double, a1() As Double
    a0 = WithValue(a, A_VASTE_KOSTEN_MODULE_MEUR, 0#)
    a1 = WithValue(a, A_VASTE_KOSTEN_MODULE_MEUR, 1#)
    g0 = LcohOf(row, a0) - LcohOf(ref1, a0)
    g1 = LcohOf(row, a1) - LcohOf(ref1, a1)
    slope = g1 - g0
    If slope > 0.000000000001 Then FixedCostBreakEven = -g0 / slope Else FixedCostBreakEven = Empty
End Function

' ---------------------------------------------------------------- bereken (run)

Private Sub Progress(ByVal label As String)
    ProgressLabel = label
    On Error Resume Next
    Application.StatusBar = "Opsplitsing: " & label & " (" & ProgressDone & " van " & ProgressTotal & " simulaties)"
    DoEvents
End Sub

Public Function RunModel(a() As Double, years As Variant, counts As Variant, ByVal strategy As String, ByVal standbyMode As String, _
                         ByVal parks As Long) As Variant
    ' Alle configuraties over alle windjaren: een rij per moduleaantal (Summarise + BreakEven).
    Dim rows() As Variant, per() As Variant, c As Long, y As Long, nY As Long, nC As Long
    nY = UBound(years) - LBound(years) + 1
    nC = UBound(counts) - LBound(counts) + 1
    ReDim rows(0 To nC - 1)
    ProgressDone = 0: ProgressTotal = nY * nC
    For c = 0 To nC - 1
        ReDim per(0 To nY - 1)
        For y = 0 To nY - 1
            Progress counts(LBound(counts) + c) & " modules, " & years(LBound(years) + y)
            per(y) = SimulateYear(years(LBound(years) + y), parks, counts(LBound(counts) + c), a, strategy, standbyMode)
            ProgressDone = ProgressDone + 1
        Next y
        rows(c) = Summarise(per, a)
    Next c
    BreakEven rows, a
    RunModel = rows
End Function

' example_day(): een representatieve dag waarop opsplitsen helpt (75e percentiel van de dagwinst, zonder onderhoud).
Public Function ExampleDay(a() As Double, years As Variant, counts As Variant, ByVal strategy As String, ByVal standbyMode As String, _
                           ByVal parks As Long) As Variant
    Dim other As Long, c As Long, y As Long, one As Variant, many As Variant, gains() As Double, days() As Long, g As Long
    Dim d1 As Variant, k1 As Variant, u1 As Variant, dn As Variant, kn As Variant, un As Variant, p As Long, q As Long
    ExampleDay = Empty
    If UBound(counts) - LBound(counts) < 1 Then Exit Function
    other = counts(LBound(counts) + 1)
    For c = LBound(counts) + 1 To UBound(counts)
        If Abs(counts(c) - 4) < Abs(other - 4) Then other = counts(c)
    Next c
    ReDim gains(0 To 400 * (UBound(years) - LBound(years) + 1)): ReDim days(0 To UBound(gains))
    g = 0
    For y = LBound(years) To UBound(years)
        one = SimulateYear(years(y), parks, counts(LBound(counts)), a, strategy, standbyMode)
        many = SimulateYear(years(y), parks, other, a, strategy, standbyMode)
        d1 = one(R_DAG_DATUM): k1 = one(R_DAG_KG): u1 = one(R_DAG_UIT)
        dn = many(R_DAG_DATUM): kn = many(R_DAG_KG): un = many(R_DAG_UIT)
        q = 0
        For p = 0 To UBound(dn)
            Do While q <= UBound(d1)
                If d1(q) >= dn(p) Then Exit Do
                q = q + 1
            Loop
            If q <= UBound(d1) Then
                If d1(q) = dn(p) And Not un(p) And Not u1(q) And kn(p) > k1(q) Then
                    gains(g) = kn(p) - k1(q): days(g) = dn(p): g = g + 1
                End If
            End If
        Next p
    Next y
    If g = 0 Then Exit Function
    SortGains gains, days, g
    ExampleDay = CDate(days(Int(g * 0.75)))
End Function

Private Sub SortGains(gains() As Double, days() As Long, ByVal count As Long)
    ' Oplopend op (winst, datum), zoals sorted(gains) in Python. Shellsort.
    Dim gap As Long, p As Long, q As Long, tg As Double, td As Long
    gap = count \ 2
    Do While gap > 0
        For p = gap To count - 1
            tg = gains(p): td = days(p)
            q = p
            Do While q >= gap
                If Not (gains(q - gap) > tg Or (gains(q - gap) = tg And days(q - gap) > td)) Then Exit Do
                gains(q) = gains(q - gap): days(q) = days(q - gap)
                q = q - gap
            Loop
            gains(q) = tg: days(q) = td
        Next p
        gap = gap \ 2
    Loop
End Sub

' ---------------------------------------------------------------- gevoeligheid

Public Function SensitiveCosts() As Variant
    SensitiveCosts = Array(A_OFFERTE_MEUR, A_VASTE_KOSTEN_MODULE_MEUR, A_STROOMPRIJS_EUR_MWH, A_NETKOSTEN_EUR_MWH, A_RENTE, _
                           A_LOOPTIJD_JAAR, A_STACK_AANDEEL, A_OPEX_AANDEEL)
End Function

Public Function SensitiveOperation(ByVal standbyMode As String) As Variant
    If standbyMode = "voorspelling" Then
        SensitiveOperation = Array(A_MINIMUMLAST, A_BOP_VAST, A_DEELLASTVOORDEEL, A_STANDBY, A_OPSTART_KOUD_MIN, _
                                   A_ONDERHOUD_DAGEN, A_STACKWISSEL_WEKEN, A_VOORSPELFOUT)
    Else
        SensitiveOperation = Array(A_MINIMUMLAST, A_BOP_VAST, A_DEELLASTVOORDEEL, A_STANDBY, A_OPSTART_KOUD_MIN, _
                                   A_STARTVERTRAGING_MIN, A_ONDERHOUD_DAGEN, A_STACKWISSEL_WEKEN)
    End If
End Function

' variants(): de aanname 25 % omlaag en omhoog binnen de grenzen; geeft het aantal (0 of 2 of 1) en vult shownValues/cases.
Public Function Variants(a() As Double, ByVal key As Long, ByVal low As Double, ByVal high As Double, ByVal scl As Double, _
                         shownValues() As Double, cases As Variant) As Long
    Dim f As Long, factor As Double, sv As Double, changed() As Double, value As Double, c As Long, list(0 To 1) As Variant
    value = a(key)
    c = 0
    For f = 0 To 1
        If f = 0 Then factor = 1 - SENSITIVITY_STEP Else factor = 1 + SENSITIVITY_STEP
        sv = MinD(MaxD(value * scl * factor, low), high)
        changed = WithValue(a, key, sv / scl)
        If value <> 0 And PerKwEur(changed) > 0 Then
            shownValues(c) = sv
            list(c) = changed
            c = c + 1
        End If
    Next f
    cases = list
    Variants = c
End Function

Private Function Advantage(years As Variant, ByVal n As Long, simA() As Double, costA() As Double, ByVal strategy As String, _
                           ByVal standbyMode As String, ByVal parks As Long) As Double
    Dim one() As Variant, many() As Variant, y As Long, nY As Long
    nY = UBound(years) - LBound(years) + 1
    ReDim one(0 To nY - 1): ReDim many(0 To nY - 1)
    For y = 0 To nY - 1
        one(y) = SimulateYear(years(LBound(years) + y), parks, 1, simA, strategy, standbyMode)
        many(y) = SimulateYear(years(LBound(years) + y), parks, n, simA, strategy, standbyMode)
        ProgressDone = ProgressDone + 2
        Progress "gevoeligheid"
    Next y
    Dim s1 As Variant, sn As Variant
    s1 = Summarise(one, costA): sn = Summarise(many, costA)
    If IsEmpty(s1(X_LCOH)) Or IsEmpty(sn(X_LCOH)) Then
        Dim l(0 To 0) As Long
        l(0) = 1
        Err.Raise ERR_BASE + 11, , NoHydrogenText(l, 1)
    End If
    Advantage = s1(X_LCOH) - sn(X_LCOH)
End Function

' sensitivity(): hoe het voordeel van n modules boven één module (€/kg) verschuift als elke aanname 25 % verandert.
' Geeft Array(basisvoordeel, items) met items(i) = Array(key, nu (getoond), soort, laag, voordeel laag, hoog, voordeel hoog, bereik).
' lows/highs/scales: grenzen en schaal per aanname (getoonde eenheden), uit het werkblad.
Public Function Sensitivity(a() As Double, years As Variant, ByVal n As Long, ByVal strategy As String, ByVal standbyMode As String, _
                            ByVal parks As Long, lows() As Double, highs() As Double, scales() As Double) As Variant
    Dim baseAdv As Double, costs As Variant, ops As Variant, items() As Variant, nItems As Long, k As Long, key As Long
    Dim sv(0 To 1) As Double, cases As Variant, cnt As Long, lo As Double, hi As Double, isCost As Boolean, ca() As Double
    If n <= 1 Or n > MAX_MODULES Then Err.Raise ERR_BASE + 12, , "Kies een aantal modules groter dan 1, een besturing en minstens één windjaar."
    costs = SensitiveCosts()
    ops = SensitiveOperation(standbyMode)
    ProgressDone = 0
    ProgressTotal = 2 * (UBound(years) - LBound(years) + 1) * (1 + 2 * (UBound(ops) + 1))
    baseAdv = Advantage(years, n, a, a, strategy, standbyMode, parks)
    ReDim items(0 To UBound(costs) + UBound(ops) + 1)
    nItems = 0
    For k = 0 To UBound(costs) + UBound(ops) + 1
        If k <= UBound(costs) Then
            key = costs(k): isCost = True
        Else
            key = ops(k - UBound(costs) - 1): isCost = False
        End If
        cnt = Variants(a, key, lows(key), highs(key), scales(key), sv, cases)
        If cnt = 2 Then
            ca = cases(0)
            If isCost Then lo = Advantage(years, n, a, ca, strategy, standbyMode, parks) Else lo = Advantage(years, n, ca, ca, strategy, standbyMode, parks)
            ca = cases(1)
            If isCost Then hi = Advantage(years, n, a, ca, strategy, standbyMode, parks) Else hi = Advantage(years, n, ca, ca, strategy, standbyMode, parks)
            items(nItems) = Array(key, a(key) * scales(key), IIf(isCost, "kosten", "bedrijfsvoering"), sv(0), lo, sv(1), hi, Abs(hi - lo))
            nItems = nItems + 1
        End If
    Next k
    ' Aflopend op bereik, stabiel (zoals sort(reverse=True) in Python).
    Dim p As Long, q As Long, item As Variant
    For p = 1 To nItems - 1
        item = items(p)
        q = p - 1
        Do While q >= 0
            If Not (items(q)(7) < item(7)) Then Exit Do
            items(q + 1) = items(q)
            q = q - 1
        Loop
        items(q + 1) = item
    Next p
    If nItems > 0 Then
        ReDim Preserve items(0 To nItems - 1)
        Sensitivity = Array(baseAdv, items)
    Else
        Sensitivity = Array(baseAdv, Empty)
    End If
End Function

' ---------------------------------------------------------------- omslagkaart

Public Function OmslagMinimumlast() As Variant
    OmslagMinimumlast = Array(0.2, 0.25, 0.3, 0.4, 0.5)
End Function

Public Function OmslagVasteKosten() As Variant
    OmslagVasteKosten = Array(0#, 0.25, 0.5, 0.75, 1#, 1.25, 1.5, 1.75, 2#)
End Function

' omslagkaart(): per minimumlast (rij) en vaste kosten (kolom) Array(beste aantal, lcoh beste, lcoh eerste) of Empty.
Public Function Omslagkaart(a() As Double, years As Variant, counts As Variant, ByVal strategy As String, ByVal standbyMode As String, _
                            ByVal parks As Long) As Variant
    Dim ml As Variant, vk As Variant, grid() As Variant, i As Long, f As Long, c As Long, y As Long, nY As Long, nC As Long
    Dim cs() As Double, vrt() As Double, sims() As Variant, per As Variant, lcoh() As Variant, best As Long
    ml = OmslagMinimumlast(): vk = OmslagVasteKosten()
    nY = UBound(years) - LBound(years) + 1
    nC = UBound(counts) - LBound(counts) + 1
    If nC < 2 Then Err.Raise ERR_BASE + 13, , "Kies minstens twee moduleaantallen, een besturing en minstens één windjaar."
    ReDim grid(0 To UBound(ml), 0 To UBound(vk))
    ProgressDone = 0: ProgressTotal = (UBound(ml) + 1) * nC * nY
    For i = 0 To UBound(ml)
        cs = WithValue(a, A_MINIMUMLAST, ml(i))
        ReDim sims(0 To nC - 1)
        For c = 0 To nC - 1
            per = NewList(nY)   ' elke ronde een nieuwe array: sims(c) mag niet meeveranderen (LibreOffice deelt arrays)
            For y = 0 To nY - 1
                Progress "omslagkaart, minimumlast " & ml(i) * 100 & " %"
                per(y) = SimulateYear(years(LBound(years) + y), parks, counts(LBound(counts) + c), cs, strategy, standbyMode)
                ProgressDone = ProgressDone + 1
            Next y
            sims(c) = per
        Next c
        For f = 0 To UBound(vk)
            vrt = WithValue(cs, A_VASTE_KOSTEN_MODULE_MEUR, vk(f))
            If PerKwEur(vrt) <= 0 Then
                grid(i, f) = Empty
            Else
                ReDim lcoh(0 To nC - 1)
                best = -1
                For c = 0 To nC - 1
                    lcoh(c) = Summarise(sims(c), vrt)(X_LCOH)
                    If Not IsEmpty(lcoh(c)) Then
                        If best < 0 Then
                            best = c
                        ElseIf lcoh(c) < lcoh(best) Then
                            best = c
                        End If
                    End If
                Next c
                If best < 0 Then best = 0
                grid(i, f) = Array(counts(LBound(counts) + best), lcoh(best), lcoh(0))
            End If
        Next f
    Next i
    Omslagkaart = grid
End Function

' ---------------------------------------------------------------- dagverloop

' day_trace(): tijdstappen van één dag per configuratie; de simulatie start twee dagen eerder. Bij ‘voorspelling’ loopt het
' venster door tot vooruitkijk_uur na de dag. Geeft per moduleaantal Array(n, module_mw, stappen, waterstof_kg, drempel_mw).
Public Function DayTrace(a() As Double, ByVal dag As Date, counts As Variant, ByVal strategy As String, ByVal standbyMode As String, _
                         ByVal parks As Long) As Variant
    Dim yr As Long, y As Long, t() As Double, mw() As Double, z() As Double, lo As Double, first As Double, ending As Double
    Dim reach As Double, i As Long, i0 As Long, i1 As Long, cnt As Long, wt() As Double, wm() As Double, wz() As Double
    Dim visFrom As Long, visTo As Long, out() As Variant, c As Long, n As Long, extra As Double, b() As Double, res As Variant
    Dim kgDay As Double, dd As Variant, dk As Variant, p As Long
    yr = Year(dag)
    EnsureData
    y = YearIndex(yr)
    t = gT(y): z = gZ(y): mw = gMW(y, parks)
    i = CLng(Int(dag)) - CLng(DateSerial(yr, 1, 1))
    lo = LocalToUnix(yr, i - 2)
    first = LocalToUnix(yr, i)
    ending = LocalToUnix(yr, i + 1)
    reach = ending
    If standbyMode = "voorspelling" Then reach = ending + a(A_VOORUITKIJK_UUR) * 3600
    i0 = -1: i1 = -1
    For i = 0 To UBound(t)
        If t(i) >= lo And t(i) < reach Then
            If i0 < 0 Then i0 = i
            i1 = i
        End If
    Next i
    If i0 < 0 Then Err.Raise ERR_BASE + 14, , "Geen windgegevens voor deze dag."
    cnt = i1 - i0 + 1
    ReDim wt(0 To cnt - 1): ReDim wm(0 To cnt - 1): ReDim wz(0 To cnt - 1)
    For i = 0 To cnt - 1
        wt(i) = t(i0 + i): wm(i) = mw(i0 + i): wz(i) = z(i0 + i)
    Next i
    visFrom = -1: visTo = cnt
    For i = 0 To cnt - 1
        If visFrom < 0 And wt(i) >= first Then visFrom = i
        If wt(i) >= ending Then
            visTo = i
            Exit For
        End If
    Next i
    If visFrom < 0 Or visTo <= visFrom Then Err.Raise ERR_BASE + 14, , "Geen windgegevens voor deze dag."
    ReDim out(LBound(counts) To UBound(counts))
    For c = LBound(counts) To UBound(counts)
        n = counts(c)
        ' Stilstand voor stackwissels volgt uit de slijtage over het hele jaar, niet uit dit venster.
        If a(A_STACKWISSEL_WEKEN) <> 0 Then
            extra = ReplacementDays(Simulate(t, mw, z, yr, n, a, strategy, standbyMode, -1, -1), a)
        Else
            extra = 0#
        End If
        b = WithValue(a, A_ONDERHOUD_DAGEN, a(A_ONDERHOUD_DAGEN) + extra)
        res = Simulate(wt, wm, wz, yr, n, b, strategy, standbyMode, visFrom, visTo - 1)
        kgDay = 0
        dd = res(R_DAG_DATUM): dk = res(R_DAG_KG)
        For p = 0 To UBound(dd)
            If dd(p) = CLng(Int(dag)) Then kgDay = dk(p)
        Next p
        out(c) = Array(n, res(R_MODULE_MW), res(R_STAPPEN), kgDay, DrawMw(a(A_MINIMUMLAST) * res(R_MODULE_MW), res(R_MODULE_MW), a))
    Next c
    DayTrace = out
End Function
