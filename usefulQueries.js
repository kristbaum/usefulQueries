/* 
 * This script provides context-based queries to statements for Wikimedia pages.
 * It creates a popup when you click on certain elements, showing data from Wikidata.
 * 
 * To activate this script, add the line below to your common.js on MediaWiki:
 * mw.loader.load("//www.wikidata.org/w/index.php?title=User:Kristbaum/usefulQueries.js&action=raw&ctype=text/javascript");
 * 
 * License: CC0
 */
$(function () {

    // Exit the script if we're not in the main namespace (article namespace).
    if (mw.config.get('wgNamespaceNumber') !== 0) {
        return;
    }

    // Function to create a popup and add an icon to the specified element.
    function createPopupAndAddIcon(element, url, icon, title, label) {
        mw.loader.using(['oojs-ui-core', 'oojs-ui-widgets', 'oojs-ui.styles.icons-interactions']).then(function () {

            // Create the icon that will trigger the popup.
            var queryIcon = new OO.ui.IconWidget({
                icon: icon,
                iconTitle: title,
                $element: $('<a>').attr({
                    href: 'https://query.wikidata.org/' + url,
                    target: '_blank',
                    style: 'background-size: 20px 20px; opacity: 0.5;'
                })
            });

            // Create the popup widget.
            var $content = $('<div>');
            var popup = new OO.ui.PopupWidget({
                $content: $content,
                width: 500,
                head: true,
                padded: false,
                label: label,
                align: 'force-right'
            });

            // Close the popup when the ESC key is pressed.
            $(document).keydown(function (e) {
                if (e.keyCode === 27) {  // ESCAPE key
                    popup.onCloseButtonClick();
                }
            });

            // When the icon is clicked, populate the popup with the iframe content and show it.
            queryIcon.$element.click(function () {
                $content.html(
                    $('<iframe scrolling="yes" frameborder="0">').attr({
                        src: 'https://query.wikidata.org/embed.html' + url,
                        width: '500',
                        height: '400'
                    })
                );
                popup.$element.attr('style', 'position:absolute; z-index:100;');
                popup.toggle(true);
                return false;  // Prevent the default action (like navigating to a link).
            });

            // Add the icon and the popup to the specified element.
            $(element).append(queryIcon.$element, popup.$element);
        });
    }

    // Prepare the URL and create the popup for the title label.
    var $title = $('.wikibase-title'),
        main_qid = $title.find('.wikibase-title-id').text().replace(/[()]/g, ''),
        url = '#%23defaultView%3AGraph%0ASELECT%20%3Fnode%20%3FnodeLabel%20%3FnodeImage%20%3FchildNode%20%3FchildNodeLabel%20%3FchildNodeImage%20%3Frgb%20WHERE%20%7B%0A%20%20%7B%0A%20%20%20%20BIND%28wd%3A'
            + main_qid + '%20AS%20%3Fnode%29%0A%20%20%20%20%3Fnode%20%3Fp%20%3Fi.%0A%20%20%20%20OPTIONAL%20%7B%20%3Fnode%20wdt%3AP18%20%3FnodeImage.%20%7D%0A%20%20%20%20%3FchildNode%20%3Fx%20%3Fp.%0A%20%20%20%20%3FchildNode%20rdf%3Atype%20wikibase%3AProperty.%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3Fi%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FQ%22%29%29%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3FchildNode%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FP%22%29%29%0A%20%20%7D%0A%20%20UNION%0A%20%20%7B%0A%20%20%20%20BIND%28%22EFFBD8%22%20AS%20%3Frgb%29%0A%20%20%20%20wd%3A'
            + main_qid + '%20%3Fp%20%3FchildNode.%0A%20%20%20%20OPTIONAL%20%7B%20%3FchildNode%20wdt%3AP18%20%3FchildNodeImage.%20%7D%0A%20%20%20%20%3Fnode%20%3Fx%20%3Fp.%0A%20%20%20%20%3Fnode%20rdf%3Atype%20wikibase%3AProperty.%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3FchildNode%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FQ%22%29%29%0A%20%20%7D%0A%20%20OPTIONAL%20%7B%0A%20%20%20%20%3Fnode%20wdt%3AP18%20%3FnodeImage.%0A%20%20%20%20%3FchildNode%20wdt%3AP18%20%3FchildNodeImage.%0A%20%20%7D%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22' + mw.config.get('wgUserLanguage') + '%22.%20%7D%0A%7D';
    createPopupAndAddIcon($title.find('.wikibase-title-id'), url, 'ellipsis', 'Click to see graph', 'Entity Graph');

    // When a Wikibase entity page loads, add popups for relevant statements.
    mw.hook('wikibase.entityPage.entityLoaded').add(function (entityData) {
        // Statement popups
        $('.wikibase-statementgroupview').each(function () {
            var statement_pid = this.id,
                statement_pLabel = $(this).find('.wikibase-statementgroupview-property-label').text();

            // Loop through each statement group view.
            $('.wikibase-statementgroupview#' + statement_pid)
                .find('.wikibase-statementview-mainsnak-container')
                .find('.wikibase-snakview-value')
                .each(function () {
                    var pidTemp, pLabelTemp, statement_target_qid, statement_target_qLabel, type, value,
                        pElement = $(this).parents('.wikibase-snakview')
                            .find('.wikibase-snakview-property').find('a');
                    if (pElement.length) {
                        pidTemp = pElement.attr('title').split(':')[1];
                        pLabelTemp = pElement.text();
                    } else {
                        pidTemp = statement_pid;
                        pLabelTemp = statement_pLabel;
                    }

                    statement_target_qid = $(this).find('a').attr('title');
                    statement_target_qLabel = $(this).find('a').text();
                    if (!statement_target_qid) {
                        // Check target datatype
                        if ($(this).find('a').length === 0) {
                            if ($(this).find('.wb-monolingualtext-value').length) {
                                statement_target_qLabel = $(this).find('.wb-monolingualtext-value').html();
                                statement_target_qid = null;
                            } else {
                                statement_target_qLabel = $(this).html();
                                try {
                                    datavalue = entityData.claims[pidTemp][0].mainsnak.datavalue
                                    type = datavalue.type;
                                } catch (e) {
                                    // Escape if it has no type
                                    type = null;
                                }
                                if (type === 'time') {
                                    // select time as value
                                    time = datavalue.value.time;
                                    statement_target_qid = '"' + time + '"^^xsd:dateTime';
                                } else if (type === 'quantity') {
                                    // select amount as value
                                    amount = datavalue.value.amount;
                                    statement_target_qid = amount;
                                } else {
                                    statement_target_qLabel = $(this).text();
                                    statement_target_qid = '"' + statement_target_qLabel + '"';
                                }
                            }
                        }
                    } else {
                        statement_target_qid = 'wd:' + statement_target_qid;
                    }
                    if (statement_target_qid) {
                        // Queries after statement value
                        if (statement_pid == "P106") {
                            console.log(statement_target_qid)

                        }
                        switch (statement_pid) {
                            case 'P106': //occupation
                                if (statement_target_qid == "wd:Q1028181") {
                                    console.log("painter detected")
                                    //var url = '%23%2523defaultView%253AImageGrid%250ASELECT%20%253Fitem%20%253Fcreator%20%253FcreatorLabel%20%253Fimage%20WHERE%20%7B%250A%2520%20SERVICE%20wikibase%253Alabel%20%7B%20bd%253AserviceParam%20wikibase%253Alanguage%20%22%5BAUTO_LANGUAGE%5D%252Cen%22.%20%7D%250A%2520%20%253Fitem%20wdt%253AP170%20wd%253A' + id + '.%250A%2520%20OPTIONAL%20%7B%20%253Fitem%20wdt%253AP18%20%253Fimage.';
                                    var url = '#%23defaultView%3AImageGrid%0ASELECT%20%3Fitem%20%3Fcreator%20%3FcreatorLabel%20%3Fimage%20WHERE%20%7B%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%20%20%3Fitem%20wdt%3AP170%20wd%3A' + main_qid + '.%0A%20%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP18%20%3Fimage.%20%7D%0A%7D%0ALIMIT%20100'
                                    createPopupAndAddIcon($(this).siblings('.wikibase-snakview-indicators'), url, 'ellipsis', 'More "' + pLabelTemp + '" "' + statement_target_qLabel + '"', '"' + pLabelTemp + '" "' + statement_target_qLabel + '"');
                                }
                                break;
                            case 'P2196': //students count
                                console.log("students count detected");
                                var url = '#%23defaultView%3ALineChart%0ASELECT%20%3Fpit%20%3Fs_count%20%20WHERE%20%7B%0A%20%20wd%3A' + main_qid + '%20p%3AP2196%20%3Fstatement.%0A%20%20%3Fstatement%20ps%3AP2196%20%3Fs_count.%0A%20%20OPTIONAL%20%7B%20%3Fstatement%20pq%3AP585%20%3Fpit.%20%7D%0A%7D'
                                createPopupAndAddIcon($(this).siblings('.wikibase-statementgroupview-property-label'), url, 'ellipsis', 'Students count over time', 'Students count of "' + main_qid + '" over time:');
                                break;
                            case 'P2124': //members count
                                console.log("members count detected");
                                var url = '#%23defaultView%3ALineChart%0ASELECT%20%3Fpit%20%3Fs_count%20%20WHERE%20%7B%0A%20%20wd%3A' + main_qid + '%20p%3AP2124%20%3Fstatement.%0A%20%20%3Fstatement%20ps%3AP2196%20%3Fs_count.%0A%20%20OPTIONAL%20%7B%20%3Fstatement%20pq%3AP585%20%3Fpit.%20%7D%0A%7D'
                                createPopupAndAddIcon($(this).siblings('.wikibase-snakview-indicators'), url, 'ellipsis', 'Members count over time', 'Members count over time:');
                                break;
                        }
                    }
                });
        });
    });
});



