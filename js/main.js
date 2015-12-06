/**
 * Created at 23.01.2015
 * @author {@link http://artzub.com|Artem Zubkov}
 */

"use strict";

(function() {
    var developmentMode = true
        , rawData
        , width = innerWidth
        , height = innerHeight
        , selectedMetric
        , selectedHospital
        , selectedData
        , metrics = {
            Effectiveness : "Эффективность"
            , Load : "Нагрузка"
            , Quality : "Качество"
            , NSabonents : "Абоненты"
        }
        , mainMetric = 'Effectiveness'
        , colors = d3.scale.ordinal()
            .range(d3.range(50, 300, 20))
        , yearReg = /^\d\d[\.:]\d\d(\.\d\d\d\d)?$/
        , reg = /^[IVX]+/
        , reg2 = /^\d+/
        , reg3 = /^.\)/
        , hideItems = []
        , hideValues = []
        ;

    var ui = d3.select('#ui')
        , vis = d3.select('#vis').append('div')
        , surfaceContainer = layers.layer().addTo(vis)
        , metricsContainer = layers.layer({position: "top right menu"}).addTo(vis)
        , hospitalListContainer = layers.layer({position: "left menu"}).addTo(vis)
        , controls = layers.layer({position: "top right menu"}).addTo(ui)
        , bottomBar = layers.layer({position : "bottom left"}).addTo(ui)
        , df = d3.format(",.2f")
        ;

    var templateCell = d3.select("#templateCell").html()
        , templateTreeNode = d3.select("#templateTreeNode").html()
        ;

    var lastOver = {
        cell : {}
        , node : {}
        , year : {}
    };
    var tooltip = d3.helper.tooltip()
        .padding(16)
        .text(function(d) {
            return d
                ? d.data
                    ? textForCell(d)
                    : d.key
                        ? yearReg.test(d.key)
                            ? textForTreeNodeYear(d)
                            : textForTreeNode(d)
                        : ""
                : ""
        });

    function repeat (string, num) {
        return new Array(num + 1).join(string);
    }

    function textForTreeNodeYear(d) {
        var delta;
        if(!d)
            return "";

        if (lastOver.node != d) {
            if (lastOver.node) {
                delta = d.value - lastOver.node.value
            }
            d.colorClass = !delta ? "" : delta > 0 ? "green" : "red";
            d.lastDelta = !delta ? "" : df(Math.abs(delta));
            lastOver.node = d;
        }
        d.valueText = df(d.value);
        d.name = d.tree_id.replace('_' + d.key, '');
        d.year = d.key;

        return template(templateCell, d);
    }

    function textForTreeNode(d) {
        var delta = {
                min : 0,
                max : 0,
                mid : 0,
                value : 0
            }, data
            , max = -Infinity
            , min = Infinity
            ;
        if(!d)
            return "";

        var k = d;
        while((data = safeValues(k))[0].key == k.key)
            k = data[0];
        d.midValue = d3.mean(data, function(k) {
            var value = k.hasOwnProperty('value')
                ? k.value
                : yearReg.test(k.key)
                    ? k.values[0][selectedMetric]
                    : 0
                ;
            max = Math.max(value, max);
            min = Math.min(value, min);
            return value;
        });

        d.minValue = min;
        d.maxValue = max;

        var key, keyObj;

        if (lastOver.node != d) {
            for(key in delta) {
                if(!delta.hasOwnProperty(key))
                    continue;
                keyObj = key == "value" ? key : key + "Value";
                if (lastOver.node)
                    delta[key] = d[keyObj] - lastOver.node[keyObj];

                key = key == "value" ? "" : key;
                d[key + 'colorClass'] = !delta[key || "value"] ? "" : delta[key || "value"] > 0 ? "green" : "red";
                d[key + 'lastDelta'] = !delta[key || "value"] ? "" : df(Math.abs(delta[key || "value"]));
            }
            lastOver.node = d;
        }
        for(key in delta)
            if(delta.hasOwnProperty(key))
                d[key + 'Text'] = df(d[key == "value" ? key : key + "Value"]);

        return template(templateTreeNode, d);
    }

    function textForCell(d) {
        var delta;
        if(!d || !d.data)
            return "";

        if (lastOver.cell != d) {
            if (lastOver.cell && lastOver.cell.data) {
                delta = d.data.value - lastOver.cell.data.value
            }
            d.data.colorClass = delta > 0 ? "green" : delta < 0 ? "red" : "";
            d.data.lastDelta = !delta ? "" : df(Math.abs(delta));
            lastOver.cell = d;
        }
        d.data.valueText = df(d.data.value);

        return template(templateCell, d.data);
    }

    function resize() {
        width = innerWidth;
        height = innerHeight;

        tooltip.spaceWidth(width)
            .spaceHeight(height);
        surface && surface.resize();
    }

    d3.select(window).on('resize', resize);

    bottomBar.div
        .attr('id', 'bottomBar')
        .classed('override', true)
    ;

    var progress = layers.progressBar().addTo(
        bottomBar.div
            .append('div')
            .style({
                'position' : 'absolute'
                , 'width' : '100%'
                , 'bottom' : '13px'
            })
            .attr('class', 'left bottom')
    );

    progress.div
        .style('height', '4px')
    ;


    surfaceContainer.div.attr('id', 'surfaceContainer');
    metricsContainer.div.attr('id', 'metricsContainer');


    var surface = layers.surface().addTo(surfaceContainer.div);

    var zero = {
        value: 0,
        data: null,
        normalized: 0
    };
    function getZero(name, year) {
        return name ? {
            value: 0,
            data: null,
            name: name,
            year: year,
            normalized: 0,
        } : zero;
    }

    function safeValues(d) {
        return d.items || d.values || d._values || [];
    }

    function makeMatrix(metric, selected) {
        var result = {}
            , stack = []
            , d = selected
            , value
            , data
            , i, j
            , max = 0
            , years = []
            , allPossibleYears = []
            , name, year
            , entryDepth = d.depth
            ;

        data = safeValues(d);
        i = data.length;

        var key = entryDepth == 0
            ? 'level'
            : entryDepth == 1
                ? 'subLevel'
                : entryDepth == 2
                ? 'subSubLevel'
                : 'name'
        ;

        while(i--) {
            // итерируем все ветки вглубь, начинаем с первой ветви
            // обратить внимание, что внизу мы меняем i, когда переходим на более нижний уровень

            // переменная stack используется, чтобы хранить с какого состояния мы перешли на нижний уровень,
            // допустим мы на уровне 2 и индекс равен 5, мы переходим на уровень 3, индекс сбрасываем до 0
            // а в stack заносим как раз текущего родителя (который ур.2 индекс 5), чтобы после просмотра 3 уровня
            // вернуться к тому же элементу на втором. Кстати, когда мы на втором уровне, в стеке где-то выше ещё
            // должна лежать ссылка на текущего родителя из уровня 1

            // чтобы года не дублировались при повторном обходе соседних веток, надо для каждой ветки её года сохранять
            // в отдельную переменную, а потом среди них уже искать все возможные варианты
            d = data[i];
            if(yearReg.test(d.key)) {
                // условие сработает, если мы дошли до самого низа одной из веток
                d = safeValues(d)[0];

                if (key != 'name' && entryDepth > 1 && d[key] == d['subLevel']) {
                    key = 'name';
                }

                value = result[d[key]];
                if(!value)
                    value = result[d[key]] = {};
                years[stack[0].i] = years[stack[0].i] || [];
                years[stack[0].i].push(d.year);
                value = value[d.year] = {
                    value : d[metric],
                    data : d
                };
                max = Math.max(value.value, max);
            }
            else {
                stack.push({
                    data : data,
                    i : i
                });
                if(d.depth > 1 && d.key == d.parent.key && safeValues(d.parent).length > 1)
                    break;
                while((data = safeValues(d))[0].key == d.key) {
                    value = d.key;
                    d = data[0];
                }
                i = data.length;
            }
            if (!i && stack.length) {
                // если в стеке что-то есть, значит мы ещё не на самом верхнем уровне, однако
                // i уже закончилась, значит мы должны вернуться на уровень вверх
                d = stack.pop();
                data = d.data;
                i = d.i;
            }
        }

        j = years.length;
        while(j--) {
            if (years[j]) {
                i = years[j].length;
                while(i--) {
                    if (allPossibleYears.indexOf(years[j][i]) === -1) {
                        allPossibleYears.push(years[j][i]);
                    }
                }
            }
        }



        data = Object.keys(result);
        j = allPossibleYears.length;
        i = data.length;
        if (!i || !j)
            return [[]];

        stack = new Array(i + 1);
        while(i--) {
            name = data[i];
            j = allPossibleYears.length;
            stack[i] = new Array(j + 1);
            while(j--) {
                year = allPossibleYears[j];
                value = result[name];
                value = value[year];
                stack[i][j] = value ? {
                    value : value.value,
                    data : value.data,
                    name : name,
                    year : year + repeat(' ', i * 10 + j),
                    normalized : value.value
                        ? value.value/(max||value.value)
                        : 0
                } : getZero(name, year);
            }
            stack[i][stack[i].length - 1] = getZero(name, 0);
        }
        stack[stack.length - 1] = allPossibleYears.map(getZero);
        stack[stack.length - 1].push(getZero());

        return stack;
    }

    var currentSurface;
    var surfaceChangeTimer;
    function makeSurface(d, multi) {
        selectedData = d;

        if (!selectedMetric || !metrics[selectedMetric]) {
            var m = Object.keys(metrics);
            selectedMetric = m && m.length ? m[0] : null;
        }

        if (!selectedMetric)
            return;

        if (surfaceChangeTimer)
            clearTimeout(surfaceChangeTimer);

        surfaceChangeTimer = setTimeout(function() {
            currentSurface = surface.appendSurface(
                selectedMetric
                , makeMatrix(selectedMetric, d)
                , multi
            ).surface
                .surfaceCellId(surfaceCellId)
                .surfaceCellOver(surfaceCellOver)
                .surfaceCellOut(surfaceCellOut)
                .surfaceCellMove(tooltip.mousemove)
                .transition()
                .duration(500)
                .surfaceHeight(surfaceHeight)
                .surfaceColor(surfaceColor)
            ;
        }, currentSurface ? 0 : 500);
    }

    var hovered;
    function surfaceCellOver(d) {
        tooltip.mouseover(d);
        hovered = d;
        currentSurface.colorize();
        currentSurface.highlightEdgeByKey(d ? d.data.name : null);
    }

    function surfaceCellOut(d) {
        tooltip.mouseout();
        hovered = null;
        currentSurface.colorize();
        currentSurface.highlightEdgeByKey();
    }

    function surfaceCellId(d, x, y) {
        return d.name ? d.name + y : x + ' ' + y
    }

    function surfaceHeight(d) {
        return -d.normalized * height * .35;
    }

    function surfaceColor(d) {
        var c = d.name ? colors(d.name) : 0;

        var real = hovered;
        if (real && !real.data && selectedData != real.parent)
            real = null;

        var o = real && real.data && d == real.data ? .8 : .5;

        real = real
            ? real.data ? real.data.name : real.key
            : null
        ;

        var s = real && d.name !== real ? .3 : 1;
        c = d3.hsl(c, s, d.name ? 0.5 + d.normalized/2 : 0).rgb();
        return "rgba(" + parseInt(c.r) + "," + parseInt(c.g) + "," + parseInt(c.b) + "," + o + ")";
    }

    function updateMetrics(d) {
        if (d.parent) {
            changeMetric(mainMetric);
            metricsContainer.div.transition()
                .duration(300)   // mouseover transition does not seem to work, but that's minor
                .style("opacity", 0)
                .transition()
                .style("display", "none");
        } else {
            metricsContainer.div.transition()
                .duration(300)   // mouseover transition does not seem to work, but that's minor
                .style("opacity", 1)
                .style("display", "block");
        }
    }

    function initMetrics() {
        metricsContainer.div.selectAll('ul')
            .remove();


        if (!metrics || !selectedMetric)
            selectedMetric = null;

        var data = Object.keys(metrics);

        selectedMetric = !selectedMetric
            ? (data && data.length ? data[0] : null)
            : selectedMetric;

        metricsContainer.div
            .append('ul')
            .selectAll('li')
            .data(data)
            .enter()
            .append('li')
            .text(function(d) {
                return metrics[d];
            })
            .on('click', changeMetric)
            .classed("selected", function(d) {
                return d == selectedMetric;
            })
        ;
    }

    function changeMetric (d) {
        setWait();
        metricsContainer.div
            .selectAll('li')
            .classed('selected', false)
        ;
        metricsContainer.div
            .selectAll('li')
            .filter(function(one) { return one === d; })
            .classed('selected', true)
        ;

        selectedMetric = d;

        selectedData && makeSurface(selectedData);

        unsetWait();
    }

    function initHospitalList(hospitalNames){
        hospitalNames = hospitalNames.filter(function (name) {
            return reg.test(name)
        });

        hospitalListContainer.div.selectAll('ul')
            .remove();

        if (!hospitalNames || !selectedHospital)
            selectedHospital = null;

        hospitalListContainer.div.style("top","40%")
            .append('ul')
            .selectAll('li')
            .data(hospitalNames)
            .enter()
            .append('li')
            .text(function(d) {
                return d;
            })
            .on('click', changeHospitalList)
            .classed("selected", true)
        ;
    }

    function changeHospitalList (d) {
        var addOrHideData;
        setWait();
        hospitalListContainer.div
            .selectAll('li')
            .filter(function(one) {
                return one === d;
            })
            .classed('selected', function(d){
                if (this.className !== "selected") {
                    addOrHideData = true;
                    return true;
                }
                addOrHideData = false;
                return false;
            })
        ;

        function addHideItemOrValue(item){
            if (item.key === d){
                return item
            }
        }
        function updateHideItemOrValue(item){
            if (item.key !== d){
                return item
            }
        }
        function hideItemOrValue(item){
            if (item){
                if (item.key !== d){
                    return item
                }else{
                    hideItems.push(item)
                }
            }
        }

        if (addOrHideData){
            var addItem = hideItems.filter(addHideItemOrValue)[0];
            hideItems = hideItems.filter(updateHideItemOrValue);

            var addValue = hideValues.filter(addHideItemOrValue)[0];
            hideValues = hideValues.filter(updateHideItemOrValue);

            selectedData.items.push(addItem);
            selectedData.values.push(addValue);
        }else{
            selectedData.items = selectedData.items.filter(hideItemOrValue);
            selectedData.values = selectedData.values.filter(hideItemOrValue);
        }

        function deromanize (str) {
            var	str = str.toUpperCase(),
                validator = /^M*(?:D?C{0,3}|C[MD])(?:L?X{0,3}|X[CL])(?:V?I{0,3}|I[XV])$/,
                token = /[MDLV]|C[MD]?|X[CL]?|I[XV]?/g,
                key = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1},
                num = 0, m;
            if (!(str && validator.test(str)))
                return false;
            while (m = token.exec(str))
                num += key[m[0]];
            return num;
        }

        selectedData.items.sort(function(itemA, itemB){
            try {
                var numberItemA = /(\w+)\..*/g.exec(itemA.key)[1];
            } catch(err) {
                return 1
            }
            try {
                var numberItemB = /(\w+)\..*/g.exec(itemB.key)[1];
            } catch(err) {
                return -1
            }


            return +deromanize(numberItemA) - (+deromanize(numberItemB));
        });
        selectedData && makeSurface(selectedData);
        unsetWait();
    }

    !function() {
        var temp = d3.select("#controls").html();
        controls.div.style("top","40%").html(temp);
        controls.div.selectAll("li")
            .on('click', function() {
                var that = d3.select(this).select("span:first-child");

                if(!currentSurface)
                    return;

                if (that.classed("expand-right")) {
                    surface.turntable(0, 0);
                }
                else if (that.classed("expand-left")) {
                    surface.turntable(1.57, 0);
                }
                else if (that.classed("expand-down")) {
                    surface.turntable(1.57, 1.58);
                }
                else if (that.classed("loop")) {
                    surface.turntable(.5, .3);
                }
            })
    }();

    function setWait() {
        d3.select("body").classed('wait', true);
    }
    function unsetWait() {
        d3.select("body").classed('wait', false);
    }

    /**
     * @param {string} cost
     * @returns {number}
     */
    function fixCost(cost) {
        return !cost || cost == "-" ? 0 : parseFloat(cost.replace(',', '.'));
    }

    var costKeys = Object.keys(metrics);
    function fixCosts(d) {
        var key
            , i = costKeys.length
            ;

        while(i--)
            if (d.hasOwnProperty(key = costKeys[i]))
                d[key] = fixCost(d[key]);
    }

    function dataParsing(err, inData) {
        var data = []
            , hashNames = {}
            ;


        progress.title('Analyse data...')
            .position(20)
            .max(100)
        ;

        if(err || !inData || !inData.length) {
            progress.title('Not data!')
                .position(100);
            err && app.logErr(err);
        }

        var lastName
            , level
            , subLevel
            , subSubLevel
            , transformedData = inData.filter(function(d, index, array) {
                lastName = d.name || lastName;

                d.name = lastName;
                hashNames[lastName] = 1;

                if (reg.test(d.name)) {
                    level = d.name;
                    subLevel = level;
                    subSubLevel = level;
                } else if (reg2.test(d.name)) {
                    subLevel = d.name;
                    subSubLevel = subLevel;
                } else if (reg3.test(d.name)) {
                    subSubLevel = d.name;
                }

                d.level = level;
                d.subLevel = subLevel;
                d.subSubLevel = subSubLevel;

                fixCosts(d);

                if (d.year) {
                    d.cell_id = d.year + '_' + index;
                }

                return d.year && d.name !== "Итого расходов";
            })
            ;

        data = d3.nest()
            .key(function(d) {
                return d.level;
            })
            .key(function(d) {
                return d.subLevel;
            })
            .key(function(d) {
                return d.subSubLevel;
            })
            .key(function(d) {
                return d.name;
            })
            .key(function(d) {
                return d.year;
            })
            .entries(transformedData)
        ;
        rawData = {
            key : "История бюджета 1937 - 1950гг.",
            values : data,
            items : data
        };

        hashNames = Object.keys(hashNames);

        colors
            .range(d3.range(0, 300, 500/(hashNames.length||1)))
            .domain(hashNames);

        progress.position(100)
            .title('Complete!')
        ;

        initMetrics(metrics);
        initHospitalList(hashNames);

        rawData.values.forEach(restructure(rawData));
        makeSurface(rawData);

    }

    var globalParentIndex = 0;
    function restructure(parent) {
        globalParentIndex += 1;
        return function (d) {
            d.parent = parent;
            if (!d.values)
                return;

            var maxMetricKey;

            d.tree_id = globalParentIndex;

            if (yearReg.test(d.key)) {
                d.tree_id = globalParentIndex + '_' + d.key;
                d.metric = d.values[0][selectedMetric];

                maxMetricKey = "mv_" + selectedMetric;

                parent[maxMetricKey] = Math.max(d.metric
                    , typeof parent[maxMetricKey] === "undefined"
                        ? -Infinity
                        : parent[maxMetricKey]
                );
                return;
            }

            var arr = d.values
                , curParent = d
                ;
            if (d.key === parent.key) {
                d.tree_id = parent.tree_id;

                if (parent.items.length > 1) {
                    d.metric = 0;
                    return;
                }

                parent.items = arr;
                curParent = parent;
            }
            else {
                d.items = arr;
            }

            arr.forEach(restructure(curParent));
        };
    }

    var loadingAttempts = 0;
    function loadDataAndParseIt (options) {
        loadingAttempts++;
        var url = 'http://mondzo.ddns.net:4077/execsvcscriptplain?name=testAuth&startparam1=data&';
        if (developmentMode) {
            url = 'data/sample' + loadingAttempts % 2 + '.csv?';
        }

        if (options && options.startDate) {
            url += 'startparam2=' + options.startDate + '&';
        }
        if (options && options.finishDate) {
            url += 'startparam3=' + options.finishDate + '&';
        }

        app.dataLoader({
            beforesend : function() {
                progress.title('loading...')
                    .max(100)
                    .position(20);
            },
            progress : function(e) {
                if (!d3.event) return;
                e = d3.event;
                progress.max(e.total)
                    .position(e.loaded);
            },
        }).loadData(
            [url]
            , dataParsing
        );
    }


    loadDataAndParseIt(app.dateTimePicker.startData);
    resize();

    app.dateTimePicker.onChange(function (dates) {
        loadDataAndParseIt({
            startDate: dates.start,
            finishDate: dates.finish,
        });
    });

    // fixed zoom event

    var timerResize;
    d3.select(document.querySelector("#zoomEvent").contentWindow)
        .on('resize', function() {
            if (timerResize) clearTimeout(timerResize);
            timerResize = setTimeout(resize, 300);
        });

    function template(template, item) {
        if (!template || !item)
            return "";

        for(var key in item) {
            if(!item.hasOwnProperty(key)) continue;
            template = template.replace("{{" + key + "}}", item[key]);
        }

        return template;
    }
})();
