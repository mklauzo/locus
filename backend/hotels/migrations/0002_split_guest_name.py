from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='reservation',
            old_name='guest_name',
            new_name='guest_last_name',
        ),
        migrations.AddField(
            model_name='reservation',
            name='guest_first_name',
            field=models.CharField(default='', max_length=127),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='reservation',
            name='guest_last_name',
            field=models.CharField(max_length=127),
        ),
    ]
