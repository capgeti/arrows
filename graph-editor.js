window.onload = function()
{
    var graphModel;

    var markups = localStorage.getItem("graph-diagram-markups");
    var storedMarkup = markups && JSON.parse(markups) || [];
    var selectedMarkup = parseInt(window.location.hash.substr(1)) || 0;

    // convert old markup
    var oldMarkup = localStorage.getItem("graph-diagram-markup");
    if (oldMarkup) {
        storedMarkup.push({ title: "untitled", markup: oldMarkup});
        localStorage.removeItem("graph-diagram-markup");
    }

    var selectUI = d3.select("#select_markup") ;

    function updateFromModel() {
        if (selectedMarkup >= storedMarkup.length) {
            selectedMarkup = storedMarkup.length - 1;
        }

        if (selectedMarkup < 0) {
            selectedMarkup = 0;
            storedMarkup.push({title: "untitled"});
        }

        selectUI.selectAll("option").data(storedMarkup)
            .text(function (d) {
                return d.title;
            })
            .enter().append("option")
            .text(function (d) {
                return d.title;
            });

        selectUI.node().selectedIndex = selectedMarkup;

        var markup = storedMarkup[selectedMarkup].markup;
        if (markup) {
            graphModel = parseMarkup(markup);
        } else {
            console.log("make new!");
            graphModel = gd.model();
            graphModel.createNode().x(50).y(140);

            // TODO this patches a bug in graph-diagram.js# trying to access node.style
            graphModel = parseMarkup(formatMarkup());
        }

        d3.select("#internalScale").node().value = graphModel.internalScale();

        save();
        draw();
    }

    selectUI.on('change', function () {
        window.location.hash =  selectedMarkup = this.selectedIndex;
        updateFromModel();
    });

    var svg = d3.select("#canvas")
        .append("svg:svg")
        .attr("class", "graphdiagram");

    var diagram = gd.diagram()
        .scaling(gd.scaling.centerOrScaleDiagramToFitSvg)
        .overlay(function(layoutModel, view) {
            var nodeOverlays = view.selectAll("circle.node.overlay")
                .data(layoutModel.nodes);

            nodeOverlays.exit().remove();

            nodeOverlays.enter().append("circle")
                .attr("class", "node overlay")
                .call( d3.behavior.drag().on( "drag", drag ).on( "dragend", dragEnd ) )
                .on( "dblclick", editNode );

            nodeOverlays
                .attr("r", function(node) {
                    return node.radius.outside();
                })
                .attr("stroke", "none")
                .attr("fill", "rgba(255, 255, 255, 0)")
                .attr("cx", function(node) {
                    return node.x;
                })
                .attr("cy", function(node) {
                    return node.y;
                });

            var nodeRings = view.selectAll("circle.node.ring")
                .data(layoutModel.nodes);

            nodeRings.exit().remove();

            nodeRings.enter().append("circle")
                .attr("class", "node ring")
                .call( d3.behavior.drag().on( "drag", dragRing ).on( "dragend", dragEnd ) );

            nodeRings
                .attr("r", function(node) {
                    return node.radius.outside() + 5;
                })
                .attr("fill", "none")
                .attr("stroke", "rgba(255, 255, 255, 0)")
                .attr("stroke-width", "10px")
                .attr("cx", function(node) {
                    return node.x;
                })
                .attr("cy", function(node) {
                    return node.y;
                });

            var relationshipsOverlays = view.selectAll("path.relationship.overlay")
                .data(layoutModel.relationships);

            relationshipsOverlays.exit().remove();

            relationshipsOverlays.enter().append("path")
                .attr("class", "relationship overlay")
                .attr("fill", "rgba(255, 255, 255, 0)")
                .attr("stroke", "rgba(255, 255, 255, 0)")
                .attr("stroke-width", "10px")
                .on( "dblclick", editRelationship );

            relationshipsOverlays
                .attr("transform", function(r) {
                    var angle = r.start.model.angleTo(r.end.model);
                    return "translate(" + r.start.model.ex() + "," + r.start.model.ey() + ") rotate(" + angle + ")";
                } )
                .attr("d", function(d) { return d.arrow.outline; } );
        });

    function draw()
    {
        svg
            .data([graphModel])
            .call(diagram);
    }

    function save()
    {
        storedMarkup[selectedMarkup].markup = formatMarkup();
        localStorage.setItem("graph-diagram-markups", JSON.stringify(storedMarkup));
    }

    var newNode = null;
    var newRelationship = null;

    function findClosestOverlappingNode( node )
    {
        var closestNode = null;
        var closestDistance = Number.MAX_VALUE;

        var allNodes = graphModel.nodeList();

        for ( var i = 0; i < allNodes.length; i++ )
        {
            var candidateNode = allNodes[i];
            if ( candidateNode !== node )
            {
                var candidateDistance = node.distanceTo( candidateNode ) * graphModel.internalScale();
                if ( candidateDistance < 50 && candidateDistance < closestDistance )
                {
                    closestNode = candidateNode;
                    closestDistance = candidateDistance;
                }
            }
        }
        return closestNode;
    }

    function drag()
    {
        var node = this.__data__.model;
        node.drag(d3.event.dx, d3.event.dy);
        diagram.scaling(gd.scaling.growButDoNotShrink);
        draw();
    }

    function dragRing()
    {
        var node = this.__data__.model;
        if ( !newNode )
        {
            newNode = graphModel.createNode().x( d3.event.x ).y( d3.event.y );
            newRelationship = graphModel.createRelationship( node, newNode );
        }
        var connectionNode = findClosestOverlappingNode( newNode );
        if ( connectionNode )
        {
            newRelationship.end = connectionNode
        } else
        {
            newRelationship.end = newNode;
        }
        node = newNode;
        node.drag(d3.event.dx, d3.event.dy);
        diagram.scaling(gd.scaling.growButDoNotShrink);
        draw();
    }

    function dragEnd()
    {
        if ( newNode )
        {
            newNode.dragEnd();
            if ( newRelationship && newRelationship.end !== newNode )
            {
                graphModel.deleteNode( newNode );
            }
        }
        newNode = null;
        save();
        diagram.scaling(gd.scaling.centerOrScaleDiagramToFitSvgSmooth);
        draw();
    }

    d3.select( "#add_node_button" ).on( "click", function ()
    {
        graphModel.createNode().x( 0 ).y( 0 );
        save();
        draw();
    } );

    function onControlEnter(saveChange)
    {
        return function()
        {
            if ( d3.event.ctrlKey && d3.event.keyCode === 13 )
            {
                saveChange();
            }
        }
    }

    function editNode()
    {
        var editor = d3.select(".pop-up-editor.node");
        appendModalBackdrop();
        editor.classed( "hide", false );

        var node = this.__data__.model;

        var captionField = editor.select("#node_caption");
        captionField.node().value = node.caption() || "";
        captionField.node().select();

        var propertiesField = editor.select("#node_properties");
        propertiesField.node().value = node.properties().list().reduce(function(previous, property) {
            return previous + property.key + ": " + property.value + "\n";
        }, "");

        function saveChange()
        {
            node.caption( captionField.node().value );
            node.properties().clearAll();
            propertiesField.node().value.split("\n").forEach(function(line) {
                var tokens = line.split(/: */);
                if (tokens.length === 2) {
                    var key = tokens[0].trim();
                    var value = tokens[1].trim();
                    if (key.length > 0 && value.length > 0) {
                        node.properties().set(key, value);
                    }
                }
            });
            save();
            draw();
            cancelModal();
        }

        function deleteNode()
        {
            graphModel.deleteNode(node);
            save();
            draw();
            cancelModal();
        }

        captionField.on("keypress", onControlEnter(saveChange) );
        propertiesField.on("keypress", onControlEnter(saveChange) );

        editor.select("#edit_node_save").on("click", saveChange);
        editor.select("#edit_node_delete").on("click", deleteNode);
    }

    function editRelationship()
    {
        var editor = d3.select(".pop-up-editor.relationship");
        appendModalBackdrop();
        editor.classed( "hide", false );

        var relationship = this.__data__.model;

        var relationshipTypeField = editor.select("#relationship_type");
        relationshipTypeField.node().value = relationship.relationshipType() || "";
        relationshipTypeField.node().select();

        var propertiesField = editor.select("#relationship_properties");
        propertiesField.node().value = relationship.properties().list().reduce(function(previous, property) {
            return previous + property.key + ": " + property.value + "\n";
        }, "");

        function saveChange()
        {
            relationship.relationshipType( relationshipTypeField.node().value );
            relationship.properties().clearAll();
            propertiesField.node().value.split("\n").forEach(function(line) {
                var tokens = line.split(/: */);
                if (tokens.length === 2) {
                    var key = tokens[0].trim();
                    var value = tokens[1].trim();
                    if (key.length > 0 && value.length > 0) {
                        relationship.properties().set(key, value);
                    }
                }
            });
            save();
            draw();
            cancelModal();
        }

        function reverseRelationship()
        {
            relationship.reverse();
            save();
            draw();
            cancelModal();
        }

        function deleteRelationship()
        {
            graphModel.deleteRelationship(relationship);
            save();
            draw();
            cancelModal();
        }

        relationshipTypeField.on("keypress", onControlEnter(saveChange) );
        propertiesField.on("keypress", onControlEnter(saveChange) );

        editor.select("#edit_relationship_save").on("click", saveChange);
        editor.select("#edit_relationship_reverse").on("click", reverseRelationship);
        editor.select("#edit_relationship_delete").on("click", deleteRelationship);
    }

    function formatMarkup()
    {
        var container = d3.select( "body" ).append( "div" );
        gd.markup.format( graphModel, container );
        var markup = container.node().innerHTML;
        markup = markup
            .replace( /<li/g, "\n  <li" )
            .replace( /<span/g, "\n    <span" )
            .replace( /<\/span><\/li/g, "</span>\n  </li" )
            .replace( /<\/ul/, "\n</ul" );
        container.remove();
        return markup;
    }

    function cancelModal()
    {
        d3.selectAll( ".modal" ).classed( "hide", true );
        d3.selectAll( ".modal-backdrop" ).remove();
    }

    d3.selectAll( ".btn.cancel" ).on( "click", cancelModal );
    d3.selectAll( ".modal" ).on( "keyup", function() { if ( d3.event.keyCode === 27 ) cancelModal(); } );

    function appendModalBackdrop()
    {
        d3.select( "body" ).append( "div" )
            .attr( "class", "modal-backdrop" )
            .on( "click", cancelModal );
    }

    var showOptions = function ()
    {
        appendModalBackdrop();
        d3.select( ".modal.export-markup" ).classed( "hide", false );

        var markup = formatMarkup();
        d3.select("#markup_title").attr("value", storedMarkup[selectedMarkup].title);
        d3.select( "textarea.code" )
            .attr( "rows", markup.split( "\n" ).length * 2 )
            .node().value = markup;
    };

    function parseMarkup( markup )
    {
        var container = d3.select( "body" ).append( "div" );
        container.node().innerHTML = markup;
        var model = gd.markup.parse( container.select("ul.graph-diagram-markup") );
        container.remove();
        return model;
    }

    var useMarkupFromMarkupEditor = function ()
    {
        storedMarkup[selectedMarkup].markup = d3.select("textarea.code").node().value;
        storedMarkup[selectedMarkup].title = d3.select("#markup_title").node().value;
        updateFromModel();
        cancelModal();
    };

    var duplicateMarkup = function ()
    {
        var newTitle = d3.select("#markup_title").node().value;

        if (newTitle === storedMarkup[selectedMarkup].title)
            newTitle += " (copy)";

        storedMarkup.push({title: newTitle, markup: d3.select("textarea.code").node().value});
        selectedMarkup = storedMarkup.length - 1;
        updateFromModel();
        cancelModal();

    };

    var removeMarkup = function ()
    {
        selectUI.selectAll("option")[0][selectedMarkup].remove();
        storedMarkup.splice(selectedMarkup, 1);
        updateFromModel();

        cancelModal();
    };

    var exportSvg = function ()
    {
        var rawSvg = new XMLSerializer().serializeToString(d3.select("#canvas svg" ).node());
        window.open( "data:image/svg+xml;base64," + btoa( rawSvg ) );
    };

    var chooseStyle = function()
    {
        appendModalBackdrop();
        d3.select( ".modal.choose-style" ).classed( "hide", false );
    };

    d3.select("#saveStyle" ).on("click", function() {
        var selectedStyle = d3.selectAll("input[name=styleChoice]" )[0]
            .filter(function(input) { return input.checked; })[0].value;

        setGraphStyle("style/" + selectedStyle);
        setTimeout(function () {
            updateFromModel()
        }, 100);

        cancelModal();
    });

    function setGraphStyle(style) {
        d3.select("link.graph-style").attr("href", style);
        localStorage.setItem("graph-diagram-style", style)
    }

    function changeInternalScale() {
        graphModel.internalScale(d3.select("#internalScale").node().value);
        draw();
    }

    var style = localStorage.getItem("graph-diagram-style");
    if(style == undefined) style = "style/graph-style-chunky.css";
    setGraphStyle(style);

    setTimeout(function () {
        updateFromModel();
    }, 100);


    d3.select(window).on("resize", draw);
    d3.select( "#internalScale" ).on("change", changeInternalScale);
    d3.select( "#exportSvgButton" ).on( "click", exportSvg );
    d3.select( "#chooseStyleButton" ).on( "click", chooseStyle );
    d3.select( "#optionsButton" ).on("click", showOptions);
    d3.select( "#save_markup" ).on("click", useMarkupFromMarkupEditor);
    d3.select( "#save_copy_markup" ).on("click", duplicateMarkup);
    d3.select( "#remove_markup" ).on("click", removeMarkup);
    d3.selectAll( ".modal-dialog" ).on( "click", function ()
    {
        d3.event.stopPropagation();
    } );
};
